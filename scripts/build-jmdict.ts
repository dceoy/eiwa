/**
 * Production JMdict_e ingestion. XML is streamed; only one entry tree is retained.
 * Mobile adaptation: at most 3 applicable senses, 3 English glosses per sense;
 * no examples, cross-references, loanword history, dialect/field metadata or audio.
 * All written forms/readings are indexed, respecting re_restr/re_nokanji and
 * sense stagk/stagr. EN indexes only the first gloss of the first sense, when
 * it is a short literal headword (<=4 words/64 chars), not a definition search.
 * The official daily endpoint is content-pinned: rotation fails closed, never
 * silently upgrades. Keep the verified cache or deliberately update date + hash.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import { SaxesParser } from "saxes";
import type { DictionaryEntry, DictionarySource } from "../src/dict-types";
import { buildDictionary } from "./build-dict-shards";

export const JMDICT_VERSION = "2026-11-07";
export const JMDICT_URL = "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz";
export const JMDICT_SHA256 = "490d2fef9cd8dfcdfcd618863c827fe2efd52992b002fb502679d4e1b7fb039d";
export const JMDICT_SOURCE: DictionarySource = {
  name: "JMdict — Electronic Dictionary Research and Development Group (EDRDG)",
  license: "CC BY-SA 4.0",
  url: "https://www.edrdg.org/edrdg/licence.html",
};
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = path.join(ROOT, ".cache", "jmdict");

export async function verifyArchive(file: string, expected = JMDICT_SHA256): Promise<void> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const actual = hash.digest("hex");
  if (actual !== expected) {
    throw new Error(
      `JMdict SHA-256 mismatch: expected ${expected}, got ${actual}. Keep the pinned archive or deliberately update the source pin.`,
    );
  }
}

async function downloadArchive(): Promise<string> {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `JMdict_e-${JMDICT_VERSION}-${JMDICT_SHA256}.gz`);
  try {
    await verifyArchive(file);
    return file;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const partial = `${file}.part`;
  try {
    const response = await fetch(JMDICT_URL, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) throw new Error(`JMdict download: HTTP ${response.status}`);
    await pipeline(response.body, createWriteStream(partial));
    await verifyArchive(partial);
    await rename(partial, file);
  } finally {
    await rm(partial, { force: true });
  }
  return file;
}

interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlNode[];
}
function nodes(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((child) => child.name === name);
}
function texts(node: XmlNode, name: string): string[] {
  return nodes(node, name).map((child) => child.text.trim());
}
function text(node: XmlNode, name: string): string {
  return texts(node, name)[0] ?? "";
}
function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function englishHeadword(gloss: string): boolean {
  return (
    gloss.length <= 64 && gloss.split(" ").length <= 4 && /^[a-z]+(?:[ '-][a-z]+)*$/i.test(gloss)
  );
}

function convertEntry(node: XmlNode): {
  ja: DictionaryEntry[];
  en: DictionaryEntry[];
  rank: number;
} {
  const seq = text(node, "ent_seq");
  if (!/^\d+$/.test(seq)) throw new Error("JMdict entry missing numeric ent_seq");
  const writings = nodes(node, "k_ele").map((writing) => text(writing, "keb"));
  const readings = nodes(node, "r_ele");
  const priorities = [...nodes(node, "k_ele"), ...readings].flatMap((element) => [
    ...texts(element, "ke_pri"),
    ...texts(element, "re_pri"),
  ]);
  const rank = priorities.some((pri) => /^(ichi|news)1$/.test(pri))
    ? 0
    : priorities.some((pri) => /^(spec|gai)1$/.test(pri))
      ? 1
      : 2;
  let inheritedPos: string[] = [];
  const senses = nodes(node, "sense").map((sense) => {
    const pos = texts(sense, "pos");
    if (pos.length) inheritedPos = pos;
    return {
      writings: texts(sense, "stagk"),
      readings: texts(sense, "stagr"),
      pos: inheritedPos,
      glosses: nodes(sense, "gloss").filter(
        (gloss) => !gloss.attrs["xml:lang"] || gloss.attrs["xml:lang"] === "eng",
      ),
    };
  });
  const ja: DictionaryEntry[] = [];
  for (const readingNode of readings) {
    const reading = text(readingNode, "reb");
    const restrictions = texts(readingNode, "re_restr");
    const allowed =
      nodes(readingNode, "re_nokanji").length || !writings.length
        ? [reading]
        : writings.filter((writing) => !restrictions.length || restrictions.includes(writing));
    for (const headword of allowed) {
      const applicable = senses
        .filter(
          (sense) =>
            (!sense.writings.length || sense.writings.includes(headword)) &&
            (!sense.readings.length || sense.readings.includes(reading)) &&
            sense.glosses.length,
        )
        .slice(0, 3);
      if (!applicable.length) continue;
      const glosses = unique(
        applicable.flatMap((sense) => sense.glosses.slice(0, 3).map((gloss) => gloss.text.trim())),
      );
      ja.push({
        id: `jmdict:${seq}:${headword}:${reading}`,
        lang: "ja",
        headword,
        reading,
        pos: unique(applicable.flatMap((sense) => sense.pos)),
        translations: glosses.map((gloss) => ({ text: gloss, lang: "en" })),
        senses: applicable.map((sense) => ({
          gloss: sense.glosses
            .slice(0, 3)
            .map((gloss) => gloss.text.trim())
            .join("; "),
        })),
        source: [JMDICT_SOURCE],
      });
    }
  }
  // One reverse-index entry per source entry, not one per spelling/reading/sense.
  const primaryGloss = senses[0]?.glosses[0];
  const gloss = primaryGloss?.text.trim() ?? "";
  const first = ja.find((entry) =>
    entry.translations.some((translation) => translation.text === gloss),
  );
  const en: DictionaryEntry[] =
    first && !primaryGloss?.attrs.g_type && englishHeadword(gloss)
      ? [
          {
            id: `jmdict-en:${seq}`,
            lang: "en",
            headword: gloss,
            pos: first.pos,
            translations: [{ text: first.headword, lang: "ja" }],
            senses: [{ gloss, translation: first.headword }],
            source: [JMDICT_SOURCE],
          },
        ]
      : [];
  return { ja, en, rank };
}

export async function parseJmdict(chunks: AsyncIterable<string>): Promise<{
  en: DictionaryEntry[];
  ja: DictionaryEntry[];
  sourceEntries: number;
}> {
  const parser = new SaxesParser({ xmlns: false });
  const stack: XmlNode[] = [];
  // Common newspaper/general vocabulary precedes specialist/loanword entries.
  const ranked = Array.from({ length: 3 }, () => ({
    en: [] as DictionaryEntry[],
    ja: [] as DictionaryEntry[],
  }));
  let sourceEntries = 0;
  // saxes never fetches external DTDs. Accept only literal internal entities,
  // not recursive expansion or external entities (avoids XML entity bombs).
  parser.on("doctype", (dtd) => {
    for (const match of dtd.matchAll(/<!ENTITY\s+([\w-]+)\s+"([^"&]*)"\s*>/g)) {
      const [, name, value] = match;
      if (name && value) parser.ENTITIES[name] = value;
    }
  });
  parser.on("opentag", (tag) => {
    if (tag.name !== "entry" && stack.length === 0) return;
    const node: XmlNode = { name: tag.name, attrs: tag.attributes, text: "", children: [] };
    stack.at(-1)?.children.push(node);
    stack.push(node);
  });
  parser.on("text", (value) => {
    const current = stack.at(-1);
    if (current) current.text += value;
  });
  parser.on("closetag", () => {
    const node = stack.pop();
    if (node?.name !== "entry") return;
    const converted = convertEntry(node);
    const bucket = ranked[converted.rank];
    bucket?.en.push(...converted.en);
    bucket?.ja.push(...converted.ja);
    sourceEntries += 1;
  });
  for await (const chunk of chunks) parser.write(chunk);
  parser.close();
  if (!sourceEntries) throw new Error("JMdict source contained no entries");
  return {
    en: ranked.flatMap((bucket) => bucket.en),
    ja: ranked.flatMap((bucket) => bucket.ja),
    sourceEntries,
  };
}

export async function buildJmdict() {
  const file = await downloadArchive();
  const input = createReadStream(file);
  const xml = input.pipe(createGunzip());
  input.on("error", (error) => xml.destroy(error));
  xml.setEncoding("utf8");
  const { en, ja, sourceEntries } = await parseJmdict(xml);
  console.log(
    `JMdict ${JMDICT_VERSION}: ${sourceEntries} source entries, ${ja.length} JA variants, ${en.length} EN index entries.`,
  );
  await buildDictionary(en, ja, {
    JMdict_e: JMDICT_VERSION,
    "JMdict_e.url": JMDICT_URL,
    "JMdict_e.sha256": JMDICT_SHA256,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildJmdict().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
