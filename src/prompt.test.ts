import { describe, expect, it } from "vitest";
import { buildUserPrompt, MAX_INPUT_CHARS, truncateSafely } from "./prompt";

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

describe("buildUserPrompt", () => {
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
