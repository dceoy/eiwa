import { prebuiltAppConfig } from "@mlc-ai/web-llm";
import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_ID, MODEL_OPTIONS } from "./model-config";
import { WEBLLM_VERSION } from "./webllm-cdn";

it("keeps Lite default and requires explicit Pro confirmation with size disclosure", () => {
  expect(DEFAULT_MODEL_ID).toBe("Qwen2.5-0.5B-Instruct-q4f16_1-MLC");
  expect(MODEL_OPTIONS.find((m) => m.label === "Pro")).toMatchObject({
    id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    approxDownloadSizeMb: 2000,
    recommendedDeviceClass: "desktop",
    requiresConfirmation: true,
  });
});

describe("pinned WebLLM model registry", () => {
  it("contains all offered model IDs and their WebGPU libraries", () => {
    expect(WEBLLM_VERSION).toBe("0.2.87");
    for (const option of MODEL_OPTIONS) {
      const record = prebuiltAppConfig.model_list.find((m) => m.model_id === option.id);
      expect(record, option.id).toBeDefined();
      expect(record?.model).toContain(option.id);
      expect(record?.model_lib).toMatch(/webgpu\.wasm$/);
    }
  });
});
