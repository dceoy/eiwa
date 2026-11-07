import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  lookupDictionary,
  resetDictionaryCaches,
  suggestHeadwords,
  suggestSpellings,
} from "../src/dict";
import type { DictionaryEntry, DictManifest, SearchIndexRef } from "../src/dict-types";
import { validateManifest } from "../src/dict-validate";
import {
  editDistance,
  RESULT_LIMIT,
  SUGGESTION_LIMIT,
  validateSearchRows,
} from "../src/search-index";
import { groupByShard } from "./build-dict-shards";
import { chunkRows, searchRows } from "./build-search-index";

function entry(word: string, frequency = 0, pos = ["noun"]): DictionaryEntry {
  return {
    id: `en:${word}`,
    headword: word,
    lang: "en",
    frequency,
    pos,
    translations: [{ text: "訳", lang: "ja" }],
    senses: [{ gloss: "test" }],
    source: [{ name: "test", license: "CC0" }],
  };
}
let assets: Map<string, unknown>;
let manifest: DictManifest;
beforeEach(() => {
  resetDictionaryCaches();
  assets = new Map();
  const entries = [
    entry("mountain", 100),
    entry("mountainous", 50),
    entry("mount", 1),
    entry("cat", 10),
    entry("catsup", 999),
    entry("bobcat", 9999),
    entry("take", 40, ["verb"]),
    entry("take off", 20, ["verb"]),
    entry("go", 30, ["verb"]),
    entry("good", 50, ["adjective"]),
    entry("child", 20),
    ...Array.from({ length: 40 }, (_, i) => ({ ...entry("crowd", 40 - i), id: `crowd:${i}` })),
    ...Array.from({ length: 20 }, (_, i) => entry(`zcap${i}`)),
  ];
  const shards = groupByShard(entries, "en");
  const refs: SearchIndexRef[] = [];
  const rows = searchRows(entries, "en");
  for (const kind of ["headwords", "inflections"] as const) {
    for (const [i, chunk] of chunkRows(rows[kind], 100).entries()) {
      const path = `dict/search/en-${kind}-${i}.json`;
      assets.set(`/${path}`, chunk);
      refs.push({
        lang: "en",
        kind,
        path,
        start: chunk[0]?.[0] ?? "",
        end: chunk.at(-1)?.[0] ?? "",
        entryCount: chunk.length,
        bytes: Buffer.byteLength(JSON.stringify(chunk)),
        checksum: `sha256:${"0".repeat(64)}`,
      });
    }
  }
  manifest = {
    schemaVersion: 1,
    builtAt: "2026-01-01",
    sourceVersions: { test: "1" },
    licenses: [{ name: "test", license: "CC0" }],
    search: refs,
    shards: [...shards.values()].map((shard) => {
      const path = `dict/en/${shard.key}.json`;
      assets.set(`/${path}`, { entries: shard.entries });
      return {
        lang: "en",
        key: shard.key,
        path,
        checksum: "sha256:x",
        entryCount: Object.values(shard.entries).flat().length,
      };
    }),
  };
  assets.set("/dict/manifest.json", manifest);
  vi.stubGlobal("caches", undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const file = String(input).split("?")[0] ?? "";
      return new Response(JSON.stringify(assets.get(file) ?? null), {
        status: assets.has(file) ? 200 : 404,
      });
    }),
  );
});
afterEach(() => {
  resetDictionaryCaches();
  vi.unstubAllGlobals();
});

describe("on-device indexed search", () => {
  it("suggests frequent prefix headwords, fetches only intersecting ranges, keeps queries private", async () => {
    expect(await suggestHeadwords("moun", "en")).toEqual(["mountain", "mountainous", "mount"]);
    const calls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(calls.every((url) => url.startsWith("/dict/") && !url.includes("moun"))).toBe(true);
    expect(calls.length).toBeLessThan((manifest.search?.length ?? 0) + 1);
    expect(await suggestHeadwords("", "en")).toEqual([]);
  });
  it.each([
    ["took", "take"],
    ["went", "go"],
    ["better", "good"],
    ["children", "child"],
    ["took off", "take off"],
  ])("resolves %s to %s with inflected-input annotation", async (query, lemma) => {
    const results = await lookupDictionary(query, "en");
    expect(results[0]?.headword).toBe(lemma);
    expect(results[0]?.match).toEqual({ kind: "inflection", query });
  });
  it("orders exact before prefix before substring regardless of frequency; no duplicate IDs", async () => {
    const results = await lookupDictionary("cat", "en");
    expect(results.map((e) => e.headword)).toEqual(["cat", "catsup", "bobcat"]);
    expect(results.map((e) => e.match?.kind)).toEqual([undefined, "prefix", "partial"]);
    expect((await lookupDictionary("cats", "en"))[0]?.headword).toBe("cat");
    expect(results.length).toBeLessThanOrEqual(RESULT_LIMIT);
    expect(new Set(results.map((e) => e.id)).size).toBe(results.length);
  });
  it.each(["missing", "offline", "malformed"])(
    "preserves cat from an accessible shard when the headword index is %s",
    async (failure) => {
      expect(validateManifest(manifest)).toEqual([]);
      for (const ref of manifest.search ?? []) {
        if (ref.kind !== "headwords") continue;
        if (failure === "malformed") assets.set(`/${ref.path}`, [["broken", "not a score"]]);
        else assets.delete(`/${ref.path}`);
      }
      if (failure === "offline") {
        const onlineFetch = vi.mocked(fetch).getMockImplementation();
        vi.mocked(fetch).mockImplementation((input, init) => {
          if (String(input).includes("headwords")) return Promise.reject(new Error("offline"));
          if (!onlineFetch) throw new Error("Missing test fetch");
          return onlineFetch(input, init);
        });
      }
      const results = await lookupDictionary("cat", "en");
      expect(results.map((e) => e.headword)).toEqual(["cat"]);
      expect(results[0]?.match).toBeUndefined();
    },
  );
  it("preserves exact and related hits when an inflection index or related shard is unavailable", async () => {
    for (const ref of manifest.search ?? []) {
      if (ref.kind === "inflections") assets.delete(`/${ref.path}`);
    }
    const related = manifest.shards.find((ref) => ref.key === "b");
    if (!related) throw new Error("Missing bobcat shard");
    assets.delete(`/${related.path}`);
    const results = await lookupDictionary("cat", "en");
    expect(results.map((e) => e.headword)).toEqual(["cat", "catsup"]);
    expect(results[1]?.match?.kind).toBe("prefix");
  });
  it("preserves available lemmas when another lemma shard and headword indexes are unavailable", async () => {
    const ref = manifest.search?.find((r) => r.kind === "inflections");
    if (!ref) throw new Error("Missing inflection ref");
    assets.set(`/${ref.path}`, [["took", ["go", "take"]]]);
    Object.assign(ref, { start: "took", end: "took", entryCount: 1 });
    manifest.search = manifest.search?.filter((r) => r.kind === "headwords" || r === ref);
    for (const other of manifest.search ?? []) {
      if (other !== ref) assets.delete(`/${other.path}`);
    }
    const missing = manifest.shards.find((r) => r.key === "g");
    if (!missing) throw new Error("Missing go shard");
    assets.delete(`/${missing.path}`);
    expect(validateManifest(manifest)).toEqual([]);
    const results = await lookupDictionary("took", "en");
    expect(results.map((e) => e.headword)).toEqual(["take"]);
    expect(results[0]?.match).toEqual({ kind: "inflection", query: "took" });
  });
  it("offers edit-distance candidates only, without converting typos into facts", async () => {
    expect(await lookupDictionary("mountan", "en")).toEqual([]);
    expect((await suggestSpellings("mountan", "en"))[0]).toBe("mountain");
    expect((await suggestSpellings("mountan", "en")).length).toBeLessThanOrEqual(SUGGESTION_LIMIT);
    expect(await suggestSpellings("x".repeat(100), "en")).toEqual([]);
    expect(await suggestSpellings("a", "en")).toEqual([]);
  });
  it("enforces result and candidate caps even for dense headword buckets", async () => {
    expect(await lookupDictionary("crowd", "en")).toHaveLength(RESULT_LIMIT);
    expect(await suggestHeadwords("zcap", "en")).toHaveLength(SUGGESTION_LIMIT);
    expect(await lookupDictionary("zcap", "en")).toHaveLength(SUGGESTION_LIMIT);
  });
  it("rejects malformed indexes and retries after repair; cache reset refetches", async () => {
    const ref = manifest.search?.find(
      (r) => r.kind === "headwords" && r.start <= "moun\uffff" && r.end >= "moun",
    );
    expect(ref).toBeDefined();
    if (!ref) return;
    const original = assets.get(`/${ref.path}`);
    assets.set(`/${ref.path}`, [["broken", "not a score"]]);
    await expect(suggestHeadwords("moun", "en")).rejects.toThrow(/Invalid search/);
    assets.set(`/${ref.path}`, original);
    expect(await suggestHeadwords("moun", "en")).toContain("mountain");
    const before = vi.mocked(fetch).mock.calls.length;
    resetDictionaryCaches();
    await suggestHeadwords("moun", "en");
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(before);
  });
});
describe("search validation and distance", () => {
  it("validates sorted rows, unique lemmas, ranges and manifest paths/counts", () => {
    expect(validateManifest(manifest)).toEqual([]);
    expect(
      validateSearchRows(
        [
          ["cat", 1],
          ["cat", 2],
        ],
        "headwords",
      ),
    ).toBe(false);
    expect(validateSearchRows([["cats", ["cat", "cat"]]], "inflections")).toBe(false);
    expect(validateSearchRows([["cat", Number.NaN]], "headwords")).toBe(false);
    const ref = manifest.search?.[0];
    if (!ref) throw new Error("Missing test ref");
    expect(validateManifest({ ...manifest, search: [ref, ref] })).not.toEqual([]);
    expect(
      validateManifest({ ...manifest, search: [{ ...ref, path: "../outside.json" }] }),
    ).not.toEqual([]);
    expect(validateManifest({ ...manifest, search: [{ ...ref, bytes: 1024 * 1024 }] })).not.toEqual(
      [],
    );
  });
  it("computes bounded Levenshtein distance for ASCII and Unicode", () => {
    expect(editDistance("mountan", "mountain", 2)).toBe(1);
    expect(editDistance("", "cat", 1)).toBe(2);
    expect(editDistance("猫山", "猫川", 1)).toBe(1);
    expect(editDistance("😀山", "😀川", 1)).toBe(1);
    expect(editDistance("same", "same", 1)).toBe(0);
  });
});
