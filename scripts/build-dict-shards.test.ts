import { describe, expect, it } from "vitest";
import { normalizeHeadword, shardKeyFor } from "../src/dict-normalize";
import { groupByShard, loadFixtures } from "./build-dict-shards";

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
