import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeHeadword, shardKeyFor } from "../src/dict-normalize";
import type {
  DictionaryEntry,
  DictionarySource,
  DictLang,
  DictManifest,
  DictShardRef,
} from "../src/dict-types";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIXTURES_DIR = path.join(ROOT, "fixtures", "dict");
const OUT_DIR = path.join(ROOT, "public", "dict");

const FIXTURE_SOURCE: DictionarySource = {
  name: "Eiwa Fixture Data",
  license: "CC0-1.0",
  url: "https://github.com/dceoy/eiwa/tree/main/fixtures/dict",
};

type FixtureEntry = Omit<DictionaryEntry, "id" | "lang" | "source">;

export interface ShardFile {
  lang: DictLang;
  key: string;
  entries: Record<string, DictionaryEntry[]>;
}

function assertFixtureEntry(value: unknown, lang: DictLang, index: number): FixtureEntry {
  if (typeof value !== "object" || value === null) {
    throw new Error(`fixtures/dict/${lang}.json[${index}]: expected an object`);
  }
  const entry = value as Record<string, unknown>;
  if (typeof entry.headword !== "string" || entry.headword.trim() === "") {
    throw new Error(`fixtures/dict/${lang}.json[${index}]: missing non-empty "headword"`);
  }
  if (!Array.isArray(entry.pos) || entry.pos.some((p) => typeof p !== "string")) {
    throw new Error(`fixtures/dict/${lang}.json[${index}]: "pos" must be a string array`);
  }
  if (!Array.isArray(entry.translations) || entry.translations.length === 0) {
    throw new Error(`fixtures/dict/${lang}.json[${index}]: needs at least one translation`);
  }
  if (!Array.isArray(entry.senses) || entry.senses.length === 0) {
    throw new Error(`fixtures/dict/${lang}.json[${index}]: needs at least one sense`);
  }
  return entry as unknown as FixtureEntry;
}

function makeId(lang: DictLang, headword: string, reading: string | undefined, seen: Set<string>) {
  const base = `${lang}:${headword}${reading ? `#${reading}` : ""}`;
  let id = base;
  let suffix = 2;
  while (seen.has(id)) {
    id = `${base}:${suffix}`;
    suffix += 1;
  }
  seen.add(id);
  return id;
}

export async function loadFixtures(
  lang: DictLang,
  seenIds: Set<string>,
): Promise<DictionaryEntry[]> {
  const file = path.join(FIXTURES_DIR, `${lang}.json`);
  const raw = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`fixtures/dict/${lang}.json must be a top-level array`);
  }

  return raw.map((value, index) => {
    const fixture = assertFixtureEntry(value, lang, index);
    return {
      ...fixture,
      id: makeId(lang, fixture.headword, fixture.reading, seenIds),
      lang,
      source: [FIXTURE_SOURCE],
    } satisfies DictionaryEntry;
  });
}

function addToShard(
  shards: Map<string, ShardFile>,
  lang: DictLang,
  key: string,
  normalized: string,
  entry: DictionaryEntry,
) {
  let shard = shards.get(key);
  if (!shard) {
    shard = { lang, key, entries: {} };
    shards.set(key, shard);
  }
  shard.entries[normalized] ??= [];
  shard.entries[normalized].push(entry);
}

export function groupByShard(entries: DictionaryEntry[], lang: DictLang): Map<string, ShardFile> {
  const shards = new Map<string, ShardFile>();

  for (const entry of entries) {
    const normalizedHeadword = normalizeHeadword(entry.headword, lang);
    addToShard(shards, lang, shardKeyFor(normalizedHeadword, lang), normalizedHeadword, entry);

    // Japanese fixtures commonly store kanji headwords with a kana reading
    // (e.g. 猫 / ねこ). Index the reading as an alias so a user typing the
    // kana form (as most users do, since IMEs convert kana to kanji rather
    // than the other way around) can still find the entry.
    if (lang === "ja" && entry.reading) {
      const normalizedReading = normalizeHeadword(entry.reading, lang);
      if (normalizedReading && normalizedReading !== normalizedHeadword) {
        addToShard(shards, lang, shardKeyFor(normalizedReading, lang), normalizedReading, entry);
      }
    }
  }

  return shards;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function clearGeneratedShards() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
}

async function writeShards(shards: Map<string, ShardFile>): Promise<DictShardRef[]> {
  const refs: DictShardRef[] = [];

  for (const shard of shards.values()) {
    const langDir = path.join(OUT_DIR, shard.lang);
    await mkdir(langDir, { recursive: true });
    const fileName = `${shard.key}.json`;
    const content = JSON.stringify({ entries: shard.entries });
    await writeFile(path.join(langDir, fileName), content, "utf8");

    const entryCount = Object.values(shard.entries).reduce((sum, list) => sum + list.length, 0);
    refs.push({
      lang: shard.lang,
      key: shard.key,
      path: `dict/${shard.lang}/${fileName}`,
      entryCount,
      checksum: `sha256:${sha256(content)}`,
    });
  }

  refs.sort((a, b) =>
    a.lang === b.lang ? a.key.localeCompare(b.key) : a.lang.localeCompare(b.lang),
  );
  return refs;
}

function uniqueLicenses(entries: DictionaryEntry[]): DictionarySource[] {
  const seen = new Map<string, DictionarySource>();
  for (const entry of entries) {
    for (const source of entry.source) {
      seen.set(`${source.name}::${source.license}`, source);
    }
  }
  return [...seen.values()];
}

async function main() {
  await clearGeneratedShards();

  const seenIds = new Set<string>();
  const en = await loadFixtures("en", seenIds);
  const ja = await loadFixtures("ja", seenIds);
  const all = [...en, ...ja];

  const enShards = groupByShard(en, "en");
  const jaShards = groupByShard(ja, "ja");
  const shardRefs = [...(await writeShards(enShards)), ...(await writeShards(jaShards))];

  const manifest: DictManifest = {
    schemaVersion: 1,
    builtAt: new Date().toISOString(),
    sourceVersions: { "eiwa-fixtures": "0.1.0" },
    shards: shardRefs,
    licenses: uniqueLicenses(all),
  };

  await writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  const shardFiles = await readdir(OUT_DIR, { recursive: true });
  console.log(
    `Built ${all.length} dictionary entries into ${shardRefs.length} shards ` +
      `(${shardFiles.length} files) at ${path.relative(ROOT, OUT_DIR)}/`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
