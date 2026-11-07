import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DictionaryEntry } from "../src/dict-types";
import { validateDictionaryEntry } from "../src/dict-validate";
import {
  coarseLevel,
  exampleHeadwords,
  indexExamples,
  ngslRanks,
  parseWiktextract,
  sentenceMap,
  TATOEBA_SOURCE,
} from "./build-data-depth";
import { searchRows } from "./build-search-index";
import { verifyDepthFile } from "./depth-sources";

async function* lines(...values: string[]) {
  yield* values;
}
function entry(headword: string, lang: "en" | "ja" = "en"): DictionaryEntry {
  return {
    id: `test:${headword}`,
    headword,
    lang,
    pos: ["verb"],
    translations: [{ text: "test", lang: "ja" }],
    senses: [{ gloss: "Test fixture" }],
    source: [TATOEBA_SOURCE],
  };
}

describe("streamed Wiktextract projection", () => {
  it("keeps only in-index English lexical fields and attested form-of targets", async () => {
    const { data, scanned } = await parseWiktextract(
      lines(
        JSON.stringify({
          word: "run",
          lang_code: "en",
          sounds: [{ ipa: "/rʌn/", audio: "unused.ogg" }, { ipa: "/rʌn/" }],
          etymology_text: `  Old English. ${"a".repeat(1000)}`,
          derived: Array.from({ length: 30 }, (_, i) => ({ word: `term${i}` })),
          related: [{ word: "walk" }],
          forms: [
            { form: "running", tags: ["present", "participle"] },
            { form: "no-table-tags", tags: ["table-tags"] },
            { form: "rin", tags: ["alternative"] },
          ],
        }),
        JSON.stringify({
          word: "ran",
          lang_code: "en",
          sounds: [{ ipa: "DO NOT COPY" }],
          senses: [{ form_of: [{ word: "run" }], tags: ["past", "form-of"] }],
        }),
        JSON.stringify({
          word: "unindexed",
          lang_code: "en",
          etymology_text: "not retained",
          senses: [{ form_of: [{ word: "absent" }] }],
        }),
        JSON.stringify({ word: "run", lang_code: "fr", etymology_text: "not English" }),
      ),
      new Set(["run"]),
    );
    expect(scanned).toBe(4);
    expect([...data.keys()]).toEqual(["run"]);
    expect(data.get("run")).toMatchObject({
      ipa: ["/rʌn/"],
      forms: ["running", "ran"],
      related: ["walk"],
    });
    expect(data.get("run")?.etymology).toHaveLength(600);
    expect(data.get("run")?.etymology?.endsWith("…")).toBe(true);
    expect(data.get("run")?.derived).toHaveLength(8);
    const lemma = { ...entry("run"), inflectionForms: data.get("run")?.forms };
    expect(searchRows([lemma], "en").inflections).toContainEqual(["ran", ["run"]]);
  });
  it("rejects corrupt JSONL and empty input rather than silently omitting a source", async () => {
    await expect(parseWiktextract(lines("not json"), new Set())).rejects.toThrow();
    await expect(parseWiktextract(lines(), new Set())).rejects.toThrow("Empty");
  });
});

it("derives coarse NGSL bands without calling them CEFR/SVL", async () => {
  const ranks = await ngslRanks(
    lines("Lemma,SFI Rank,SFI", "run,1000,2", "walk,1001,1", "TRUE,478,1", "invalid,,0"),
  );
  expect(coarseLevel(ranks.get("run"))).toBe("basic");
  expect(coarseLevel(ranks.get("true"))).toBe("basic");
  expect(coarseLevel(ranks.get("walk"))).toBe("intermediate");
  expect(coarseLevel(ranks.get("absent"))).toBe("advanced");
  await expect(ngslRanks(lines("bad header"))).rejects.toThrow();
});

it("uses word/compound boundaries, not English substrings", () => {
  expect(
    exampleHeadwords(
      "The runner can run home.",
      "en",
      new Set(["run", "runner", "can run", "can run home", "unn"]),
    ),
  ).toEqual(["runner", "can run", "can run home", "run"]);
  expect(exampleHeadwords("電車に乗る。", "ja", new Set(["電車", "車", "乗る"]))).toEqual([
    "電車",
    "乗る",
  ]);
});

it("retains contributor IDs and names, rejecting unowned/oversized sentences", async () => {
  const map = await sentenceMap(
    lines(
      "1\teng\tRun!\tAlice\tdate",
      "2\teng\tMissing owner\t\\N",
      "3\tjpn\t走れ\tBob",
      `4\teng\t${"x".repeat(241)}\tAlice`,
    ),
    "eng",
  );
  expect([...map.values()]).toEqual([{ id: 1, text: "Run!", author: "Alice" }]);
});

it("indexes direct EN–JA links in both languages, deduplicates and caps each word", async () => {
  const en = await sentenceMap(
    lines(...Array.from({ length: 5 }, (_, i) => `${i + 1}\teng\tRun ${i}!\tAlice`)),
    "eng",
  );
  const ja = await sentenceMap(lines("11\tjpn\t電車で走る。\tBob"), "jpn");
  const entries = { en: [entry("run")], ja: [entry("電車", "ja")] };
  const links = ["1\t11", "11\t1", "1\t11", "2\t11", "3\t11", "4\t11", "5\t11", "8\t99"];
  const { index, bytes } = await indexExamples(lines(...links), en, ja, entries);
  expect(index.en.get("run")).toHaveLength(3);
  expect(index.ja.get("電車")).toHaveLength(3);
  expect(index.en.get("run")?.[0]?.ja.author).toBe("Bob");
  expect(bytes.en).toBeGreaterThan(0);
  const limited = await indexExamples(lines(...links), en, ja, entries, 1);
  expect(limited.index.en.size).toBe(0);
  expect(limited.bytes.ja).toBe(0);
});

it("accounts for repeated entries and Japanese reading aliases in byte budgets", async () => {
  const en = await sentenceMap(lines("1\teng\tRun!\tAlice"), "eng");
  const ja = await sentenceMap(lines("2\tjpn\t電車\tBob"), "jpn");
  const build = (reading?: string) =>
    indexExamples(lines("1\t2"), en, ja, {
      en: [entry("run")],
      ja: [{ ...entry("電車", "ja"), reading }],
    });
  expect((await build("でんしゃ")).bytes.ja).toBe((await build()).bytes.ja * 2);
});

it("validates example attribution and bounded lexical data", () => {
  const valid = {
    ...entry("run"),
    examples: [
      { en: { id: 1, text: "Run!", author: "Alice" }, ja: { id: 2, text: "走れ", author: "Bob" } },
    ],
    level: "basic",
    inflectionForms: ["ran"],
  };
  expect(validateDictionaryEntry(valid, "test")).toEqual([]);
  expect(
    validateDictionaryEntry({ ...valid, source: [], level: "CEFR-C2" }, "test").length,
  ).toBeGreaterThan(0);
  expect(
    validateDictionaryEntry(
      { ...valid, examples: [{ en: { id: 1, text: "Run!", author: "\\N" } }] },
      "test",
    ).length,
  ).toBeGreaterThan(0);
  expect(
    validateDictionaryEntry({ ...valid, inflectionForms: ["x".repeat(65)] }, "test").length,
  ).toBeGreaterThan(0);
});

it("verifies source hashes without trusting cached filenames", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "eiwa-depth-"));
  try {
    const file = path.join(dir, "source");
    await writeFile(file, "abc");
    await expect(
      verifyDepthFile(file, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"),
    ).resolves.toBeUndefined();
    await expect(verifyDepthFile(file, "0".repeat(64))).rejects.toThrow("SHA-256 mismatch");
  } finally {
    await rm(dir, { recursive: true });
  }
});
