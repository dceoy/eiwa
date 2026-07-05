import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MODEL_OPTIONS } from "./model-config";
import { loadSettings, saveSettings } from "./settings";

const STORAGE_KEY = "eiwa:settings:v1";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("loadSettings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual({
      aiEnabled: false,
      modelId: MODEL_OPTIONS[0]?.id,
      directionChoice: "auto",
    });
  });

  it("round-trips whatever saveSettings wrote", () => {
    const secondModel = MODEL_OPTIONS[1]?.id;
    expect(secondModel).toBeTruthy();
    saveSettings({ aiEnabled: true, modelId: secondModel as string, directionChoice: "ja-en" });

    expect(loadSettings()).toEqual({
      aiEnabled: true,
      modelId: secondModel,
      directionChoice: "ja-en",
    });
  });

  it("falls back to defaults field-by-field for malformed stored values", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ aiEnabled: "yes", modelId: 42, directionChoice: "sideways" }),
    );

    expect(loadSettings()).toEqual({
      aiEnabled: false,
      modelId: MODEL_OPTIONS[0]?.id,
      directionChoice: "auto",
    });
  });

  it("falls back to the default model when the stored model ID no longer exists", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ aiEnabled: true, modelId: "some-removed-model", directionChoice: "auto" }),
    );

    expect(loadSettings().modelId).toBe(MODEL_OPTIONS[0]?.id);
  });

  it("returns defaults for invalid JSON instead of throwing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadSettings()).toEqual({
      aiEnabled: false,
      modelId: MODEL_OPTIONS[0]?.id,
      directionChoice: "auto",
    });
  });
});
