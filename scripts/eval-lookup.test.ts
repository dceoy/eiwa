// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupDictionary, resetDictionaryCaches } from "../src/dict";
import type { DictionaryEntry } from "../src/dict-types";
import {
  CATEGORIES,
  DIRECTIONS,
  type LookupQuery,
  localDictionaryFetch,
  parseQueries,
  requireJmdict,
  scoreLookup,
  summaryRow,
} from "./eval-lookup";

const query: LookupQuery = {
  id: "v1-test",
  input: "cat",
  direction: "en-ja",
  category: "single-word",
  expected: [{ headword: "cat", senses: ["猫"] }],
};
const entry: DictionaryEntry = {
  id: "test-cat",
  headword: "cat",
  lang: "en",
  pos: ["noun"],
  translations: [{ text: "猫", lang: "ja" }],
  senses: [{ gloss: "cat" }],
  source: [{ name: "Test", license: "CC0-1.0" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetDictionaryCaches();
});

describe("curated v1 data", () => {
  it("has 100 valid unique queries balanced across category and direction", async () => {
    const queries = parseQueries(
      await readFile(new URL("../eval/queries.jsonl", import.meta.url), "utf8"),
    );
    expect(queries).toHaveLength(100);
    for (const category of CATEGORIES) {
      for (const direction of DIRECTIONS) {
        expect(
          queries.filter((q) => q.category === category && q.direction === direction),
        ).toHaveLength(10);
      }
    }
  });

  it("rejects malformed, empty, duplicated and incomplete expectations", () => {
    for (const invalid of [
      "",
      "{",
      "null",
      JSON.stringify({ ...query, direction: "en-fr" }),
      JSON.stringify({ ...query, category: "typo" }),
      JSON.stringify({ ...query, expected: [] }),
      JSON.stringify({ ...query, expected: [{ headword: "cat", senses: [""] }] }),
    ]) {
      expect(() => parseQueries(invalid)).toThrow();
    }
    const line = JSON.stringify(query);
    expect(() => parseQueries(`${line}\n${line}`)).toThrow(/duplicate/);
    expect(() =>
      parseQueries(`${line}\n${JSON.stringify({ ...query, id: "v1-other", input: " CAT " })}`),
    ).toThrow(/duplicate/);
    expect(parseQueries(`\n${line}\r\n`)).toEqual([query]);
  });
});

describe("quality metrics", () => {
  it("separates exact hits, first-result usefulness and no-result misses", () => {
    expect(scoreLookup(query, [entry])).toEqual({ exact: true, top1: true, miss: false });
    expect(scoreLookup(query, [])).toEqual({ exact: false, top1: false, miss: true });
    const wrong = { ...entry, translations: [{ text: "犬", lang: "ja" as const }] };
    expect(scoreLookup(query, [wrong, entry])).toEqual({ exact: true, top1: false, miss: false });
    expect(
      scoreLookup(query, [
        { ...wrong, translations: [...wrong.translations, ...entry.translations] },
      ]).top1,
    ).toBe(false);
    expect(scoreLookup(query, [{ ...entry, headword: "dog" }])).toEqual({
      exact: false,
      top1: false,
      miss: false,
    });
    expect(scoreLookup({ ...query, input: "ＣＡＴ" }, [entry]).exact).toBe(true);
  });

  it("accepts kana aliases and inflection lemmas without calling them literal hits", () => {
    const ja: LookupQuery = {
      ...query,
      input: "ねこ",
      direction: "ja-en",
      expected: [{ headword: "猫", senses: ["cat"] }],
    };
    const cat: DictionaryEntry = {
      ...entry,
      headword: "猫",
      lang: "ja",
      translations: [{ text: "Cat (domestic)", lang: "en" }],
    };
    expect(scoreLookup(ja, [cat])).toEqual({ exact: false, top1: true, miss: false });
    expect(
      scoreLookup(ja, [{ ...cat, translations: [{ text: "cat burglar", lang: "en" }] }]).top1,
    ).toBe(false);
    expect(scoreLookup({ ...query, input: "cats" }, [entry])).toEqual({
      exact: false,
      top1: true,
      miss: false,
    });
  });

  it("counts each query once and uses all queries as the denominator", () => {
    expect(summaryRow("test", [scoreLookup(query, [entry, entry]), scoreLookup(query, [])])).toBe(
      "| test | 1/2 (50.0%) | 1/2 (50.0%) | 1/2 (50.0%) |",
    );
  });

  it("refuses fixtures/missing provenance rather than publishing misleading scores", () => {
    expect(() => requireJmdict({ "eiwa-fixtures": "0.1.0" })).toThrow(/Production JMdict/);
    expect(() => requireJmdict({ JMdict_e: "date" })).toThrow();
    expect(() =>
      requireJmdict({ JMdict_e: "date", "JMdict_e.sha256": "a".repeat(64) }),
    ).not.toThrow();
  });
});

it("feeds local assets through src/dict.ts and fails closed on missing/invalid assets or remote URLs", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "eiwa-eval-"));
  try {
    await mkdir(path.join(dir, "dict"));
    await writeFile(
      path.join(dir, "dict/manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        builtAt: "2026-11-07T00:00:00Z",
        sourceVersions: { "test-only": "1" },
        licenses: entry.source,
        shards: [
          { lang: "en", key: "c", path: "dict/c.json", checksum: "sha256:test", entryCount: 1 },
        ],
      }),
    );
    await writeFile(path.join(dir, "dict/c.json"), JSON.stringify({ entries: { cat: [entry] } }));
    const fetchLocal = localDictionaryFetch(dir);
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("fetch", fetchLocal);
    expect(await lookupDictionary("CAT", "en")).toEqual([entry]);
    expect(await lookupDictionary("caterpillar", "en")).toEqual([]);
    await expect(fetchLocal("https://example.com/dict/c.json")).rejects.toThrow(/Only local/);
    await expect(fetchLocal("/dict/%2e%2e%2fsecret")).rejects.toThrow(/Only local/);
    await expect(fetchLocal("/dict/missing.json")).rejects.toThrow(/ENOENT/);
    await writeFile(path.join(dir, "dict/c.json"), "{}");
    resetDictionaryCaches();
    await expect(lookupDictionary("cat", "en")).rejects.toThrow(/Invalid dictionary shard/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
