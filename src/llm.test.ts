import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalAiEngine, isWebGpuSupported } from "./llm";
import type { WebLlmModule } from "./webllm-cdn";
import { loadWebLlm } from "./webllm-cdn";

vi.mock("./webllm-cdn", () => ({
  loadWebLlm: vi.fn(),
}));

const mockedLoadWebLlm = vi.mocked(loadWebLlm);

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage(): void {}
  terminate(): void {}
}

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

describe("createLocalAiEngine with WebGPU available (mocked worker/CDN)", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { gpu: {} });
    vi.stubGlobal("Worker", FakeWorker);
    mockedLoadWebLlm.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows ensureReady() to be retried after a failure, instead of replaying the same rejection forever", async () => {
    mockedLoadWebLlm.mockRejectedValueOnce(new Error("network down"));
    const engine = createLocalAiEngine();

    await expect(engine.ensureReady()).rejects.toThrow("network down");
    expect(engine.getStatus()).toBe("failed");

    mockedLoadWebLlm.mockResolvedValueOnce({
      CreateWebWorkerMLCEngine: vi.fn().mockResolvedValue({ interruptGenerate: vi.fn() }),
    } as unknown as WebLlmModule);

    await engine.ensureReady();
    expect(engine.getStatus()).toBe("ready");
    expect(mockedLoadWebLlm).toHaveBeenCalledTimes(2);
  });

  it("rejects an in-flight explain() immediately when dispose() is called, instead of hanging forever", async () => {
    const neverSettles = new Promise(() => {
      // simulates a Worker that never responds (e.g. terminated mid-request)
    });
    const fakeEngine = {
      chat: { completions: { create: vi.fn().mockReturnValue(neverSettles) } },
      interruptGenerate: vi.fn(),
    };
    mockedLoadWebLlm.mockResolvedValueOnce({
      CreateWebWorkerMLCEngine: vi.fn().mockResolvedValue(fakeEngine),
    } as unknown as WebLlmModule);

    const engine = createLocalAiEngine();
    await engine.ensureReady();

    const explainPromise = engine.explain({
      direction: "en-ja",
      input: "cat",
      dictionaryContext: [],
    });
    await Promise.resolve();
    expect(engine.getStatus()).toBe("generating");

    engine.dispose();

    await expect(explainPromise).rejects.toThrow("AI engine was disposed");
    expect(engine.getStatus()).toBe("idle");
  });
});
