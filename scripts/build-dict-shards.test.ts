import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupDictionary, resetDictionaryCaches } from "../src/dict";
import { normalizeHeadword, resolveShardKey, shardKeyFor } from "../src/dict-normalize";
import type { DictionaryEntry, DictLang } from "../src/dict-types";
import { groupByShard, loadFixtures, splitShards } from "./build-dict-shards";

afterEach(() => {
  resetDictionaryCaches();
  vi.unstubAllGlobals();
});

describe("groupByShard (real Japanese fixtures)", () => {
  it("indexes a kanji entry under its kana reading so kana/katakana input resolves it", async () => {
    const entries = await loadFixtures("ja", new Set());
    const shards = groupByShard(entries, "ja");

    const normalized = normalizeHeadword("ネコ", "ja");
    const shard = shards.get(shardKeyFor(normalized, "ja"));
    const matches = shard?.entries[normalized] ?? [];

    expect(matches.some((entry) => entry.headword === "猫")).toBe(true);
    expect(
      matches.find((entry) => entry.headword === "猫")?.translations.some((t) => t.text === "cat"),
    ).toBe(true);
  });

  it("still indexes every fixture entry under its own headword", async () => {
    const entries = await loadFixtures("ja", new Set());
    const shards = groupByShard(entries, "ja");

    for (const entry of entries) {
      const normalized = normalizeHeadword(entry.headword, "ja");
      const shard = shards.get(shardKeyFor(normalized, "ja"));
      expect(shard?.entries[normalized]).toContain(entry);
    }
  });
});

function hotEntries(lang: DictLang, prefix: string): DictionaryEntry[] {
  return Array.from({ length: 120 }, (_, i) => ({
    id: `${lang}:${i}`,
    lang,
    headword: `${prefix}${i}`,
    reading: lang === "ja" ? `カ${i}` : undefined,
    pos: [],
    translations: [{ text: "test", lang: "en" }],
    senses: [{ gloss: "test" }],
    source: [{ name: "Test", license: "CC0-1.0" }],
  }));
}

describe("adaptive shard routing", () => {
  for (const [lang, prefix] of [
    ["en", "s"],
    ["ja", "し"],
    ["ja", "か"],
    ["ja", "𠮷"],
  ] as const) {
    it(`routes every hot ${prefix} headword and reading through the app lookup`, async () => {
      const input = hotEntries(lang, prefix);
      const shards = splitShards(groupByShard(input, lang), 1800);
      const keys = new Set(shards.keys());
      expect(shards.size).toBeGreaterThan(16);
      expect(keys.has(prefix)).toBe(false);
      const refs = [...shards.values()].map((shard, i) => ({
        lang,
        key: shard.key,
        path: `dict/${lang}/${i}.json`,
        checksum: "sha256:test",
        entryCount: 1,
      }));
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url === "/dict/manifest.json")
            return Response.json({
              schemaVersion: 1,
              builtAt: "2026-11-07",
              sourceVersions: {},
              shards: refs,
              licenses: [{ name: "Test", license: "CC0-1.0" }],
            });
          const ref = refs.find((ref) => url.startsWith(`/${ref.path}?`));
          if (!ref) throw new Error(`Unexpected fetch ${url}`);
          return Response.json({ entries: shards.get(ref.key)?.entries });
        }),
      );
      for (const shard of shards.values()) {
        expect(Buffer.byteLength(JSON.stringify({ entries: shard.entries }))).toBeLessThanOrEqual(
          1800,
        );
        for (const word of Object.keys(shard.entries)) {
          expect(resolveShardKey(word, lang, keys)).toBe(shard.key);
        }
      }
      for (const entry of input) {
        expect(await lookupDictionary(entry.headword, lang)).toContainEqual(entry);
        if (entry.reading)
          expect(await lookupDictionary(entry.reading, lang)).toContainEqual(entry);
      }
      expect(await lookupDictionary(`${prefix}missing`, lang)).toEqual([]);
    });
  }

  it("fails closed when one lookup bucket alone exceeds the budget", () => {
    expect(() => splitShards(groupByShard(hotEntries("en", "s").slice(0, 1), "en"), 10)).toThrow(
      /Cannot split/,
    );
  });

  it("indexes prototype-like English headwords safely", () => {
    const entry = { ...hotEntries("en", "s")[0], headword: "constructor" } as DictionaryEntry;
    expect(groupByShard([entry], "en").get("c")?.entries.constructor).toEqual([entry]);
  });
});
