import { describe, expect, it } from "vitest";
import { normalizeHeadword, shardKeyFor } from "./dict-normalize";

describe("normalizeHeadword", () => {
  it("lowercases and trims English input", () => {
    expect(normalizeHeadword("  Cat ", "en")).toBe("cat");
  });

  it("folds full-width ASCII punctuation/letters typed via an IME", () => {
    expect(normalizeHeadword("Ｃａｔ", "en")).toBe("cat");
  });

  it("trims Japanese input without altering kanji/kana", () => {
    expect(normalizeHeadword("  猫  ", "ja")).toBe("猫");
  });

  it("folds full-width katakana input to hiragana for consistent shard keys", () => {
    expect(normalizeHeadword("ネコ", "ja")).toBe("ねこ");
  });
});

describe("shardKeyFor", () => {
  it("shards English by first ASCII letter", () => {
    expect(shardKeyFor("cat", "en")).toBe("c");
  });

  it("buckets non-letter English input under _", () => {
    expect(shardKeyFor("42", "en")).toBe("_");
  });

  it("shards Japanese by first character", () => {
    expect(shardKeyFor("ねこ", "ja")).toBe("ね");
    expect(shardKeyFor("犬", "ja")).toBe("犬");
  });

  it("buckets empty input under _", () => {
    expect(shardKeyFor("", "ja")).toBe("_");
  });
});
