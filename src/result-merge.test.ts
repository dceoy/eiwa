import { describe, expect, it } from "vitest";
import type { DictionaryEntry } from "./dict-types";
import { mergeResult } from "./result-merge";
import type { AiExplanationOutput } from "./result-schema";

const catEntry: DictionaryEntry = {
  id: "en:cat",
  headword: "cat",
  lang: "en",
  pos: ["noun"],
  pronunciation: { ipa: "/kæt/" },
  translations: [{ text: "猫", lang: "ja", priority: 1 }],
  senses: [{ gloss: "A small domesticated carnivorous mammal." }],
  etymology: "From Old English catt.",
  derivedWords: ["kitten"],
  source: [{ name: "Eiwa Fixture Data", license: "CC0-1.0" }],
};

const aiOutput: AiExplanationOutput = {
  translation: { primary: "ねこ", alternatives: ["ニャンコ"] },
  correction: { corrected: null, explanation: null },
  nuance: ["カジュアルな響きです。"],
  warnings: [],
};

describe("mergeResult", () => {
  it("uses dictionary translation as the primary when AI is unavailable", () => {
    const result = mergeResult({
      direction: "en-ja",
      input: "cat",
      dictionaryEntries: [catEntry],
      ai: null,
    });

    expect(result.translation.primary).toBe("猫");
    expect(result.dictionary).toEqual([catEntry]);
    expect(result.etymology).toBe("From Old English catt.");
    expect(result.pronunciation).toEqual({ ipa: "/kæt/" });
    expect(result.derivedWords).toEqual(["kitten"]);
    expect(result.sourceKinds).toEqual(["dictionary"]);
  });

  it("prefers the AI translation but keeps dictionary facts untouched", () => {
    const result = mergeResult({
      direction: "en-ja",
      input: "cat",
      dictionaryEntries: [catEntry],
      ai: aiOutput,
    });

    expect(result.translation.primary).toBe("ねこ");
    expect(result.translation.alternatives).toContain("ニャンコ");
    expect(result.translation.alternatives).toContain("猫");
    expect(result.dictionary).toEqual([catEntry]);
    expect(result.etymology).toBe("From Old English catt.");
    expect(result.sourceKinds).toEqual(["dictionary", "ai"]);
  });

  it("never lets an AI explanation invent etymology or pronunciation", () => {
    const result = mergeResult({
      direction: "en-ja",
      input: "cat",
      dictionaryEntries: [],
      ai: aiOutput,
    });

    expect(result.etymology).toBeNull();
    expect(result.pronunciation).toBeNull();
    expect(result.dictionary).toEqual([]);
    expect(result.sourceKinds).toEqual(["ai"]);
  });

  it("reports no source kinds on a total miss", () => {
    const result = mergeResult({
      direction: "en-ja",
      input: "zzznotaword",
      dictionaryEntries: [],
      ai: null,
    });

    expect(result.sourceKinds).toEqual([]);
    expect(result.translation.primary).toBe("");
  });

  it("surfaces a dictionary-miss warning when there is no dictionary entry and no AI output", () => {
    const result = mergeResult({
      direction: "en-ja",
      input: "zzznotaword",
      dictionaryEntries: [],
      ai: null,
    });

    expect(result.warnings).toEqual(["No dictionary entry was found for this input."]);
  });

  it("does not surface a dictionary-miss warning when AI produced output", () => {
    const result = mergeResult({
      direction: "en-ja",
      input: "zzznotaword",
      dictionaryEntries: [],
      ai: aiOutput,
    });

    expect(result.warnings).toEqual([]);
  });

  it("does not surface a dictionary-miss warning when dictionary entries were found", () => {
    const result = mergeResult({
      direction: "en-ja",
      input: "cat",
      dictionaryEntries: [catEntry],
      ai: null,
    });

    expect(result.warnings).toEqual([]);
  });

  it("appends extra warnings (e.g. AI failure notices) without dropping AI warnings", () => {
    const result = mergeResult({
      direction: "en-ja",
      input: "cat",
      dictionaryEntries: [catEntry],
      ai: { ...aiOutput, warnings: ["スラング表現です。"] },
      extraWarnings: ["AI explanations unavailable."],
    });

    expect(result.warnings).toEqual(["スラング表現です。", "AI explanations unavailable."]);
  });
});
