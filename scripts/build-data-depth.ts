/** Bounded, build-time dictionary enrichment. No source JSONL is read whole. */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { normalizeHeadword } from "../src/dict-normalize";
import type {
  DictionaryEntry,
  DictionaryExample,
  DictionarySource,
  DictLang,
  ExampleSentence,
} from "../src/dict-types";
import { depthArchive, depthVersions } from "./depth-sources";

export const TATOEBA_SOURCE: DictionarySource = {
  name: "Tatoeba contributors",
  license: "CC BY 2.0 FR",
  url: "https://tatoeba.org/en/terms_of_use",
  licenseUrl: "https://creativecommons.org/licenses/by/2.0/fr/",
  attribution:
    "Sentences from Tatoeba. Each sentence credits its contributor and links to the original. Text is unchanged; pairs are selected and token-indexed by Eiwa.",
};
export const WIKTEXTRACT_SOURCE: DictionarySource = {
  name: "English Wiktionary contributors via Kaikki / Wiktextract (Tatu Ylonen)",
  license: "CC BY-SA 4.0",
  url: "https://kaikki.org/dictionary/English/",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  attribution:
    "Extracted English headword data; etymologies trimmed, terms/forms capped by Eiwa. Original article links provide contributor history. No Wiktionary quotations or audio redistributed.",
};
export const NGSL_SOURCE: DictionarySource = {
  name: "New General Service List 1.2 — Browne, C., Culligan, B., and Phillips, J.",
  license: "CC BY-SA 4.0",
  url: "https://www.newgeneralservicelist.com/new-general-service-list",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  attribution:
    "Eiwa coarse bands: ranks 1–1000 basic, remaining ranked NGSL intermediate, outside the ranked list advanced. Not CEFR or SVL; unranked supplementary words are not included.",
};
export const MAX_EXAMPLES = 3;
export const EXAMPLE_LANGUAGE_BYTES = 24 * 1024 * 1024;
export const MAX_ETYMOLOGY = 600;
export const MAX_TERMS = 8;
export const MAX_FORMS = 24;

export async function* fileLines(file: string, gzip = false): AsyncGenerator<string> {
  const input = createReadStream(file);
  const stream = gzip ? input.pipe(createGunzip()) : input;
  input.on("error", (error) => stream.destroy(error));
  try {
    for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) yield line;
  } finally {
    stream.destroy();
    input.destroy();
  }
}

/** External tools decompress to a pipe, never an unbounded buffer or temp JSONL. */
export async function* archiveLines(file: string, tar = false): AsyncGenerator<string> {
  const child = spawn(tar ? "tar" : "bzip2", tar ? ["-xOjf", file, "links.csv"] : ["-dc", file], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const exited = once(child, "close");
  try {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity }))
      yield line;
    const [code] = await exited;
    if (code !== 0) throw new Error(`Decompression failed (${code}): ${file}`);
  } finally {
    child.kill();
  }
}

interface WiktextractRow {
  word?: string;
  lang_code?: string;
  sounds?: { ipa?: string }[];
  etymology_text?: string;
  derived?: { word?: string }[];
  related?: { word?: string }[];
  forms?: { form?: string; tags?: string[] }[];
  senses?: { form_of?: { word?: string }[]; tags?: string[] }[];
}
interface LexicalData {
  ipa: string[];
  etymology?: string;
  derived: string[];
  related: string[];
  forms: string[];
}
function appendUnique(target: string[], values: string[], cap: number) {
  for (const value of values)
    if (target.length < cap && !target.includes(value)) target.push(value);
}
function term(value: string | undefined): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= 64 && !/[\r\n\t]/.test(value)
  );
}
function usableForm(tags: string[] = []): boolean {
  return !tags.some((tag) =>
    [
      "table-tags",
      "inflection-template",
      "romanization",
      "alternative",
      "archaic",
      "obsolete",
      "nonstandard",
      "error-unrecognized-form",
    ].includes(tag),
  );
}

export async function parseWiktextract(lines: AsyncIterable<string>, words: Set<string>) {
  const data = new Map<string, LexicalData>();
  const get = (word: string) => {
    let row = data.get(word);
    if (!row) {
      row = { ipa: [], derived: [], related: [], forms: [] };
      data.set(word, row);
    }
    return row;
  };
  let scanned = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as WiktextractRow;
    scanned++;
    if (row.lang_code !== "en" || !term(row.word)) continue;
    const word = normalizeHeadword(row.word, "en");
    // Form-of records only contribute morphology to existing lemmas. Never
    // copy an inflected pronunciation/etymology onto the lemma itself.
    for (const sense of row.senses ?? []) {
      if (!usableForm(sense.tags)) continue;
      for (const target of sense.form_of ?? []) {
        if (!term(target.word)) continue;
        const lemma = normalizeHeadword(target.word, "en");
        if (words.has(lemma) && lemma !== word) appendUnique(get(lemma).forms, [word], MAX_FORMS);
      }
    }
    if (!words.has(word)) continue;
    const out = get(word);
    appendUnique(
      out.ipa,
      (row.sounds ?? []).flatMap((sound) =>
        sound.ipa && sound.ipa.length <= 100 ? [sound.ipa] : [],
      ),
      2,
    );
    if (!out.etymology && row.etymology_text) {
      const text = row.etymology_text.replace(/\s+/g, " ").trim();
      if (text)
        out.etymology =
          text.length <= MAX_ETYMOLOGY ? text : `${text.slice(0, MAX_ETYMOLOGY - 1)}…`;
    }
    appendUnique(
      out.derived,
      (row.derived ?? []).flatMap((item) => (term(item.word) ? [item.word] : [])),
      MAX_TERMS,
    );
    appendUnique(
      out.related,
      (row.related ?? []).flatMap((item) => (term(item.word) ? [item.word] : [])),
      MAX_TERMS,
    );
    appendUnique(
      out.forms,
      (row.forms ?? []).flatMap((item) =>
        term(item.form) &&
        /^[a-z]+(?:[ '-][a-z]+)*$/i.test(item.form) &&
        usableForm(item.tags) &&
        item.form !== word
          ? [normalizeHeadword(item.form, "en")]
          : [],
      ),
      MAX_FORMS,
    );
  }
  if (!scanned) throw new Error("Empty Wiktextract input");
  return { data, scanned };
}

export async function ngslRanks(lines: AsyncIterable<string>): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  for await (const line of lines) {
    const [word, rank] = line.split(",");
    if (word && /^[a-z]+$/i.test(word) && Number.isInteger(Number(rank)) && Number(rank) > 0)
      ranks.set(normalizeHeadword(word, "en"), Number(rank));
  }
  if (!ranks.size) throw new Error("NGSL contains no ranked words");
  return ranks;
}
export function coarseLevel(rank: number | undefined): DictionaryEntry["level"] {
  return rank === undefined ? "advanced" : rank <= 1000 ? "basic" : "intermediate";
}

export async function sentenceMap(lines: AsyncIterable<string>, language: "eng" | "jpn") {
  const sentences = new Map<number, ExampleSentence>();
  for await (const line of lines) {
    const [id, lang, text, author] = line.split("\t");
    if (
      lang !== language ||
      !text ||
      text.length > (language === "eng" ? 240 : 120) ||
      !author ||
      author === "\\N" ||
      !/^\d+$/.test(id ?? "")
    )
      continue;
    sentences.set(Number(id), { id: Number(id), text, author });
  }
  return sentences;
}

const segments = {
  en: new Intl.Segmenter("en", { granularity: "word" }),
  ja: new Intl.Segmenter("ja", { granularity: "word" }),
};
/** Exact EN tokens/2–4 word phrases and JA segment/compound spans, not arbitrary substrings. */
export function exampleHeadwords(text: string, lang: DictLang, words: Set<string>): string[] {
  const found = new Set<string>();
  const parts = [...segments[lang].segment(normalizeHeadword(text, lang))];
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]?.isWordLike) continue;
    let span = "";
    let count = 0;
    for (let j = i; j < parts.length && count < 4; j++) {
      const part = parts[j];
      if (!part || (!part.isWordLike && !/^\s+$/.test(part.segment))) break;
      span += part.segment;
      if (!part.isWordLike) continue;
      count++;
      if (words.has(span)) found.add(span);
    }
  }
  return [...found];
}

export async function indexExamples(
  links: AsyncIterable<string>,
  en: Map<number, ExampleSentence>,
  ja: Map<number, ExampleSentence>,
  entries: { en: DictionaryEntry[]; ja: DictionaryEntry[] },
  budget = EXAMPLE_LANGUAGE_BYTES,
) {
  const index = {
    en: new Map<string, DictionaryExample[]>(),
    ja: new Map<string, DictionaryExample[]>(),
  };
  const costs = { en: new Map<string, number>(), ja: new Map<string, number>() };
  for (const lang of ["en", "ja"] as const)
    for (const entry of entries[lang]) {
      const word = normalizeHeadword(entry.headword, lang);
      // JA reading aliases serialize the same entry twice; account for both.
      const copies =
        lang === "ja" && entry.reading && normalizeHeadword(entry.reading, lang) !== word ? 2 : 1;
      costs[lang].set(word, (costs[lang].get(word) ?? 0) + copies);
    }
  const words = { en: new Set(costs.en.keys()), ja: new Set(costs.ja.keys()) };
  const bytes = { en: 0, ja: 0 };
  let eligibleLinks = 0;
  for await (const line of links) {
    const [left, right] = line.split("\t").map(Number);
    // links.csv contains both directions. Select EN→JA once; output supports both lookups.
    const english = en.get(left ?? 0);
    const japanese = ja.get(right ?? 0);
    if (!english || !japanese) continue;
    eligibleLinks++;
    const pair = { en: english, ja: japanese };
    const size = Buffer.byteLength(JSON.stringify(pair)) + 1;
    for (const lang of ["en", "ja"] as const) {
      if (bytes[lang] >= budget) continue;
      for (const word of exampleHeadwords(pair[lang].text, lang, words[lang])) {
        const list = index[lang].get(word) ?? [];
        if (
          list.length >= MAX_EXAMPLES ||
          list.some((p) => p.en.id === english.id && p.ja.id === japanese.id)
        )
          continue;
        const cost =
          (size + (list.length ? 0 : Buffer.byteLength(JSON.stringify(TATOEBA_SOURCE)) + 16)) *
          (costs[lang].get(word) ?? 1);
        if (bytes[lang] + cost > budget) continue;
        list.push(pair);
        index[lang].set(word, list);
        bytes[lang] += cost;
      }
    }
  }
  if (!eligibleLinks) throw new Error("No eligible Tatoeba EN–JA links");
  return { index, bytes, eligibleLinks };
}

export async function enrichDictionary(en: DictionaryEntry[], ja: DictionaryEntry[]) {
  const words = new Set(en.map((entry) => normalizeHeadword(entry.headword, "en")));
  const { data, scanned } = await parseWiktextract(
    fileLines(await depthArchive("Wiktextract"), true),
    words,
  );
  const ranks = await ngslRanks(fileLines(await depthArchive("NGSL")));
  for (const entry of en) {
    const word = normalizeHeadword(entry.headword, "en");
    const lexical = data.get(word);
    if (lexical) {
      if (lexical.ipa.length) entry.pronunciation = { ipa: lexical.ipa.join("; ") };
      if (lexical.etymology) entry.etymology = lexical.etymology;
      if (lexical.derived.length) entry.derivedWords = lexical.derived;
      if (lexical.related.length) entry.relatedWords = lexical.related;
      if (lexical.forms.length) entry.inflectionForms = lexical.forms;
      if (
        lexical.ipa.length ||
        lexical.etymology ||
        lexical.derived.length ||
        lexical.related.length ||
        lexical.forms.length
      )
        entry.source.push({
          ...WIKTEXTRACT_SOURCE,
          url: `https://en.wiktionary.org/wiki/${encodeURIComponent(entry.headword)}#English`,
        });
    }
    if (/^[a-z]+$/.test(word)) {
      entry.level = coarseLevel(ranks.get(word));
      entry.source.push(NGSL_SOURCE);
    }
  }
  console.log(
    `Wiktextract: ${scanned} streamed rows; ${[...data.values()].filter((r) => r.ipa.length).length} words with IPA; ${[...data.values()].filter((r) => r.etymology).length} with etymology; NGSL ${ranks.size} ranked lemmas.`,
  );
  data.clear();
  const english = await sentenceMap(archiveLines(await depthArchive("tatoeba-eng")), "eng");
  const japanese = await sentenceMap(archiveLines(await depthArchive("tatoeba-jpn")), "jpn");
  const examples = await indexExamples(
    archiveLines(await depthArchive("tatoeba-links"), true),
    english,
    japanese,
    { en, ja },
  );
  for (const lang of ["en", "ja"] as const)
    for (const entry of lang === "en" ? en : ja) {
      const pairs = examples.index[lang].get(normalizeHeadword(entry.headword, lang));
      if (pairs) {
        entry.examples = pairs;
        entry.source.push(TATOEBA_SOURCE);
      }
    }
  console.log(
    `Tatoeba: ${examples.eligibleLinks} eligible links; EN ${examples.index.en.size} words / ${examples.bytes.en} budget bytes; JA ${examples.index.ja.size} words / ${examples.bytes.ja} budget bytes.`,
  );
  return { versions: depthVersions(), licenses: [TATOEBA_SOURCE, WIKTEXTRACT_SOURCE, NGSL_SOURCE] };
}
