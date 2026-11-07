import { describe, expect, it } from "vitest";
import type { DictionaryEntry } from "./dict-types";
import {
  buildSystemPrompt,
  buildUserPrompt,
  MAX_CONTEXT_BYTES,
  MAX_INPUT_CHARS,
  truncateSafely,
} from "./prompt";

describe("truncateSafely", () => {
  it("leaves input at exactly the limit untouched", () => {
    const input = "a".repeat(MAX_INPUT_CHARS);
    expect(truncateSafely(input, MAX_INPUT_CHARS)).toBe(input);
    expect(truncateSafely(input, MAX_INPUT_CHARS)).toHaveLength(MAX_INPUT_CHARS);
  });

  it("truncates input one character over the limit", () => {
    const input = "a".repeat(MAX_INPUT_CHARS + 1);
    const truncated = truncateSafely(input, MAX_INPUT_CHARS);
    expect(truncated).toHaveLength(MAX_INPUT_CHARS);
    expect(truncated).toBe("a".repeat(MAX_INPUT_CHARS));
  });

  it("does not split a surrogate pair straddling the limit", () => {
    // 499 ASCII chars + one astral emoji (2 UTF-16 code units) = 501 code
    // units total, with the emoji's high surrogate landing exactly at index
    // MAX_INPUT_CHARS - 1 (i.e. a naive slice(0, 500) would cut the pair).
    const emoji = "😀";
    expect(emoji).toHaveLength(2);
    const input = "a".repeat(MAX_INPUT_CHARS - 1) + emoji;
    expect(input.length).toBe(MAX_INPUT_CHARS + 1);

    const truncated = truncateSafely(input, MAX_INPUT_CHARS);

    expect(truncated).toBe("a".repeat(MAX_INPUT_CHARS - 1));
    expect(truncated.charCodeAt(truncated.length - 1)).toBeLessThan(0xd800);
  });
});

const runEntry: DictionaryEntry = {
  id: "en:run",
  headword: "run",
  lang: "en",
  pos: ["verb"],
  translations: [{ text: "走る", lang: "ja" }],
  senses: [
    { gloss: "to move quickly on foot" },
    { gloss: "to operate a business" },
    { gloss: "to flow" },
  ],
  pronunciation: { ipa: "/ɹʌn/" },
  examples: [
    {
      en: { id: 1, text: "I run every day.", author: "a" },
      ja: { id: 2, text: "毎日走ります。", author: "b" },
    },
  ],
  source: [{ name: "JMdict", license: "CC BY-SA 4.0" }],
};

describe("buildUserPrompt", () => {
  it("grounds polysemous run in actual senses, sources, examples and IPA", () => {
    const prompt = buildUserPrompt({
      direction: "en-ja",
      input: "run",
      dictionaryContext: [runEntry],
    });
    for (const sense of runEntry.senses) expect(prompt).toContain(sense.gloss);
    expect(prompt).toContain("[D1]");
    expect(prompt).toContain("JMdict");
    expect(prompt).toContain("I run every day.");
    expect(prompt).toContain("毎日走ります。");
    expect(prompt).toContain("/ɹʌn/");
    expect(prompt).toContain("headword-level");
    const system = buildSystemPrompt();
    expect(system).toContain("Do not invent dictionary facts: readings, senses");
    expect(system).toContain("dictionary sections are rendered separately");
    expect(system).toContain("translation FIRST");
  });

  it("includes supplied Japanese readings and sense examples, not invented facts", () => {
    const entry = {
      ...runEntry,
      reading: "はしる",
      examples: [],
      pronunciation: undefined,
      senses: [{ gloss: "to run", examples: ["速く走る"] }],
    };
    const prompt = buildUserPrompt({
      direction: "ja-en",
      input: "走る",
      dictionaryContext: [entry],
    });
    expect(prompt).toContain('Reading: "はしる"');
    expect(prompt).toContain("速く走る");
    expect(prompt).not.toContain("IPA");
  });

  it("caps entries, per-field lengths and UTF-8 context bytes even for huge multilingual data", () => {
    const huge = {
      ...runEntry,
      senses: Array.from({ length: 100 }, () => ({ gloss: "😀日本語".repeat(100) })),
    };
    const prompt = buildUserPrompt({
      direction: "en-ja",
      input: "run",
      dictionaryContext: Array(100).fill(huge),
    });
    const context =
      prompt.split(
        "Dictionary context (for grounding only; do not just repeat it verbatim):\n",
      )[1] ?? "";
    expect(new TextEncoder().encode(context).length).toBeLessThanOrEqual(MAX_CONTEXT_BYTES);
    expect(context).toContain("Context capped");
    expect(context).not.toContain("[D4]");
    expect(context).not.toContain("�");
    expect(context).not.toContain("sense 4:");
  });

  it("includes the full input at exactly the character limit", () => {
    const input = "a".repeat(MAX_INPUT_CHARS);
    const prompt = buildUserPrompt({ direction: "en-ja", input, dictionaryContext: [] });
    expect(prompt).toContain(`Input: ${input}`);
  });

  it("truncates input beyond the character limit", () => {
    const input = "a".repeat(MAX_INPUT_CHARS + 1);
    const prompt = buildUserPrompt({ direction: "en-ja", input, dictionaryContext: [] });
    expect(prompt).toContain(`Input: ${"a".repeat(MAX_INPUT_CHARS)}`);
    expect(prompt).not.toContain("a".repeat(MAX_INPUT_CHARS + 1));
  });
});
