import { describe, expect, it } from "vitest";
import { normalizeInput } from "./normalize";

describe("normalizeInput", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeInput("  hello   world  ").text).toBe("hello world");
  });

  it("flags empty/whitespace-only input", () => {
    expect(normalizeInput("   ").isEmpty).toBe(true);
    expect(normalizeInput("cat").isEmpty).toBe(false);
  });

  it("treats a single word as not sentence-like", () => {
    expect(normalizeInput("cat").isSentenceLike).toBe(false);
  });

  it("treats multi-word input as sentence-like", () => {
    expect(normalizeInput("I have a cat").isSentenceLike).toBe(true);
    expect(normalizeInput("猫が好きです。").isSentenceLike).toBe(true);
  });
});
