import { describe, expect, it } from "vitest";
import { createLocalAiEngine, isWebGpuSupported } from "./llm";

describe("isWebGpuSupported", () => {
  it("returns false in a test environment without navigator.gpu", () => {
    expect(isWebGpuSupported()).toBe(false);
  });
});

describe("createLocalAiEngine", () => {
  it("starts idle and rejects ensureReady when WebGPU is unavailable", async () => {
    const engine = createLocalAiEngine();
    expect(engine.getStatus()).toBe("idle");

    await expect(engine.ensureReady()).rejects.toThrow("webgpu-unavailable");
    expect(engine.getStatus()).toBe("failed");
  });

  it("rejects explain() before the engine has been initialized", async () => {
    const engine = createLocalAiEngine();
    await expect(
      engine.explain({ direction: "en-ja", input: "cat", dictionaryContext: [] }),
    ).rejects.toThrow(/not ready/);
  });

  it("dispose() resets status back to idle", async () => {
    const engine = createLocalAiEngine();
    await engine.ensureReady().catch(() => undefined);
    expect(engine.getStatus()).toBe("failed");

    engine.dispose();
    expect(engine.getStatus()).toBe("idle");
  });
});
