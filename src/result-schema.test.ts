import { describe, expect, it } from "vitest";
import { validateAiExplanationOutput } from "./result-schema";

const validPayload = {
  translation: { primary: "猫", alternatives: ["ネコ"] },
  correction: { corrected: null, explanation: null },
  nuance: ["カジュアルな表現です。"],
  warnings: [],
};

describe("validateAiExplanationOutput", () => {
  it("accepts a well-formed payload", () => {
    expect(validateAiExplanationOutput(validPayload)).toEqual(validPayload);
  });

  it("fills in missing optional arrays with empty defaults", () => {
    const result = validateAiExplanationOutput({
      translation: { primary: "cat" },
      correction: {},
    });
    expect(result).toEqual({
      translation: { primary: "cat", alternatives: [] },
      correction: { corrected: null, explanation: null },
      nuance: [],
      warnings: [],
    });
  });

  it("rejects non-objects", () => {
    expect(validateAiExplanationOutput(null)).toBeNull();
    expect(validateAiExplanationOutput("cat")).toBeNull();
    expect(validateAiExplanationOutput(42)).toBeNull();
  });

  it("rejects a payload missing translation.primary", () => {
    expect(validateAiExplanationOutput({ translation: {} })).toBeNull();
  });

  it("rejects a payload where translation is not an object", () => {
    expect(validateAiExplanationOutput({ translation: "cat" })).toBeNull();
  });

  it("ignores extraneous fields the model might hallucinate", () => {
    const result = validateAiExplanationOutput({
      ...validPayload,
      etymology: "should be ignored",
      dictionary: [{ headword: "should be ignored" }],
    });
    expect(result).toEqual(validPayload);
  });
});
