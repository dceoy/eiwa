import { describe, expect, it } from "vitest";
import { detectDirection, sourceLangFor, targetLangFor } from "./language";

describe("detectDirection", () => {
  it("detects English input", () => {
    expect(detectDirection("hello world")).toBe("en-ja");
  });

  it("detects Japanese hiragana/katakana input", () => {
    expect(detectDirection("こんにちは")).toBe("ja-en");
    expect(detectDirection("コーヒー")).toBe("ja-en");
  });

  it("detects Japanese kanji-only input", () => {
    expect(detectDirection("猫")).toBe("ja-en");
  });

  it("treats mixed English+Japanese as Japanese input", () => {
    expect(detectDirection("I love 猫")).toBe("ja-en");
  });

  it("returns null for input with no recognizable script", () => {
    expect(detectDirection("12345")).toBeNull();
    expect(detectDirection("🎉🎉")).toBeNull();
  });
});

describe("sourceLangFor / targetLangFor", () => {
  it("maps en-ja to an English source and Japanese target", () => {
    expect(sourceLangFor("en-ja")).toBe("en");
    expect(targetLangFor("en-ja")).toBe("ja");
  });

  it("maps ja-en to a Japanese source and English target", () => {
    expect(sourceLangFor("ja-en")).toBe("ja");
    expect(targetLangFor("ja-en")).toBe("en");
  });
});
