import { describe, expect, it } from "vitest";
import { validateDictionaryEntry, validateManifest, validateShardPayload } from "./dict-validate";

const validEntry = {
  id: "en:cat",
  headword: "cat",
  lang: "en",
  pos: ["noun"],
  translations: [{ text: "猫", lang: "ja" }],
  senses: [{ gloss: "A small domesticated carnivorous mammal." }],
  source: [{ name: "Eiwa Fixture Data", license: "CC0-1.0" }],
};

const validManifest = {
  schemaVersion: 1,
  builtAt: "2026-01-01T00:00:00.000Z",
  sourceVersions: { "eiwa-fixtures": "0.1.0" },
  shards: [{ lang: "en", key: "c", path: "dict/en/c.json", entryCount: 1, checksum: "sha256:abc" }],
  licenses: [{ name: "Eiwa Fixture Data", license: "CC0-1.0" }],
};

describe("validateManifest", () => {
  it("accepts a well-formed manifest", () => {
    expect(validateManifest(validManifest)).toEqual([]);
  });

  it("rejects a non-object", () => {
    expect(validateManifest(null).length).toBeGreaterThan(0);
  });

  it("flags a missing checksum prefix", () => {
    const issues = validateManifest({
      ...validManifest,
      shards: [{ ...validManifest.shards[0], checksum: "abc" }],
    });
    expect(issues.some((issue) => issue.path.includes("checksum"))).toBe(true);
  });

  it("flags an empty shard list", () => {
    const issues = validateManifest({ ...validManifest, shards: [] });
    expect(issues.some((issue) => issue.path === "manifest.shards")).toBe(true);
  });
});

describe("validateDictionaryEntry", () => {
  it("accepts a well-formed entry", () => {
    expect(validateDictionaryEntry(validEntry, "entry")).toEqual([]);
  });

  it("flags a missing headword", () => {
    const { headword: _headword, ...rest } = validEntry;
    const issues = validateDictionaryEntry(rest, "entry");
    expect(issues.some((issue) => issue.path === "entry.headword")).toBe(true);
  });

  it("flags an invalid lang", () => {
    const issues = validateDictionaryEntry({ ...validEntry, lang: "fr" }, "entry");
    expect(issues.some((issue) => issue.path === "entry.lang")).toBe(true);
  });

  it("flags missing source attribution", () => {
    const issues = validateDictionaryEntry({ ...validEntry, source: [] }, "entry");
    expect(issues.some((issue) => issue.path === "entry.source")).toBe(true);
  });
});

describe("validateShardPayload", () => {
  it("accepts a well-formed shard", () => {
    expect(validateShardPayload({ entries: { cat: [validEntry] } })).toEqual([]);
  });

  it("flags a shard missing the entries map", () => {
    expect(validateShardPayload({}).length).toBeGreaterThan(0);
  });

  it("flags an empty entry bucket", () => {
    const issues = validateShardPayload({ entries: { cat: [] } });
    expect(issues.some((issue) => issue.path === "shard.entries.cat")).toBe(true);
  });
});
