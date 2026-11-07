import { describe, expect, it } from "vitest";
import type { DictionaryEntry } from "../src/dict-types";
import { priorityScore } from "./build-jmdict";
import { chunkRows, searchRows } from "./build-search-index";
import { frequencyScore, parseFrequency, rankEntries } from "./frequency";

function entry(headword: string, lang: "en" | "ja" = "en", frequency = 0): DictionaryEntry {
  return {
    id: `${lang}:${headword}`,
    headword,
    lang,
    frequency,
    pos: ["noun"],
    translations: [{ text: lang === "en" ? "猫" : "cat", lang: lang === "en" ? "ja" : "en" }],
    senses: [{ gloss: "test" }],
    source: [{ name: "test", license: "CC0" }],
  };
}
describe("compact search indexes", () => {
  it("deduplicates and sorts headwords/reading aliases and inflection targets", () => {
    const cat = entry("Cat");
    const rows = searchRows(
      [cat, { ...cat, id: "second", frequency: 20 }, entry("constructor")],
      "en",
    );
    expect(rows.headwords).toEqual([
      ["cat", 20],
      ["constructor", 0],
    ]);
    expect(rows.inflections).toContainEqual(["cats", ["cat"]]);
    const ja = searchRows([{ ...entry("猫", "ja"), reading: "ネコ" }], "ja");
    expect(ja.headwords.map(([word]) => word)).toEqual(["ねこ", "猫"]);
  });
  it("chunks by UTF-8 byte budget without overlapping ranges or dropped rows", () => {
    const rows = searchRows(
      Array.from({ length: 50 }, (_, i) => entry(`猫${i}`, "ja")),
      "ja",
    ).headwords;
    const chunks = chunkRows(rows, 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(rows);
    expect(chunks.every((chunk) => Buffer.byteLength(JSON.stringify(chunk)) <= 80)).toBe(true);
    expect(() => chunkRows([["oversized", 0]], 5)).toThrow(/Oversized/);
  });
});
describe("published frequency ranking", () => {
  it("parses counts and uses the least frequent token for unseen English phrases", () => {
    const scores = parseFrequency("Cat 100\ncat 10\ntake 1000\noff 20\n", "en");
    expect(scores.get("cat")).toBe(2004);
    expect(frequencyScore("take off", "en", scores)).toBe(scores.get("off"));
    expect(frequencyScore("unknown phrase", "en", scores)).toBe(0);
    expect(() => parseFrequency("bad data", "en")).toThrow(/Malformed/);
  });
  it("uses JMdict markers for JA, corpus scores for reverse candidates, preserves sense order", () => {
    expect(priorityScore(["ichi1", "ichi1"])).toBe(priorityScore(["ichi1"]));
    expect(priorityScore(["news1", "nf01"])).toBeGreaterThan(priorityScore(["spec2", "nf48"]));
    const ja = [
      {
        ...entry("猫", "ja", 100_000),
        translations: [
          { text: "cat", lang: "en" as const },
          { text: "geisha", lang: "en" as const },
        ],
      },
      entry("キャット", "ja", 100_000),
    ];
    const en: DictionaryEntry[] = [
      {
        ...entry("cat"),
        translations: [
          { text: "キャット", lang: "ja" as const },
          { text: "猫", lang: "ja" as const },
        ],
      },
    ];
    rankEntries(
      en,
      ja,
      new Map([
        ["cat", 4000],
        ["geisha", 5000],
      ]),
      new Map([
        ["猫", 4000],
        ["キャット", 1000],
      ]),
    );
    expect(en[0]?.translations[0]?.text).toBe("猫");
    expect(en[0]?.translations[0]?.priority).toBeLessThan(en[0]?.translations[1]?.priority ?? 0);
    expect(en[0]?.headwordFrequency).toBe(4000);
    expect(ja[0]?.translations[0]?.text).toBe("cat");
  });
});
