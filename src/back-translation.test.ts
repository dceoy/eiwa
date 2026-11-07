import { describe, expect, it, vi } from "vitest";
import { backTranslate } from "./back-translation";
import type { AiEngine, AiStatus } from "./llm";

function engine(status: AiStatus = "ready"): AiEngine {
  return {
    getStatus: () => status,
    ensureReady: vi.fn(),
    dispose: vi.fn(),
    explain: vi.fn().mockResolvedValue({ translation: { primary: "I run.", alternatives: [] } }),
  };
}

describe("local back-translation", () => {
  it.each([
    ["en-ja", "ja-en"],
    ["ja-en", "en-ja"],
  ] as const)("reverses %s into %s", async (direction, reverse) => {
    const ai = engine();
    expect(await backTranslate(ai, direction, "走ります。")).toBe("I run.");
    expect(ai.explain).toHaveBeenCalledWith({
      direction: reverse,
      input: "走ります。",
      dictionaryContext: [],
      signal: undefined,
    });
    expect(ai.ensureReady).not.toHaveBeenCalled();
  });
  it("never initializes an unready engine", async () => {
    const ai = engine("loading-model");
    expect(await backTranslate(ai, "en-ja", "猫")).toBeNull();
    expect(ai.explain).not.toHaveBeenCalled();
  });
  it("degrades failures and cancellation quietly", async () => {
    const ai = engine();
    vi.mocked(ai.explain).mockRejectedValueOnce(new Error("generation-invalid-json"));
    expect(await backTranslate(ai, "en-ja", "猫")).toBeNull();
    const controller = new AbortController();
    vi.mocked(ai.explain).mockImplementationOnce(async () => {
      controller.abort();
      return {
        translation: { primary: "stale", alternatives: [] },
        correction: { corrected: null, explanation: null },
        nuance: [],
        warnings: [],
      };
    });
    expect(await backTranslate(ai, "en-ja", "猫", controller.signal)).toBeNull();
  });
});
