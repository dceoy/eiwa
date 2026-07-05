import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import type { DictionaryEntry } from "./dict-types";
import type { Direction } from "./language";
import { DEFAULT_MODEL_ID, MODEL_OPTIONS } from "./model-config";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { type AiExplanationOutput, validateAiExplanationOutput } from "./result-schema";
import { loadWebLlm } from "./webllm-cdn";

export type AiStatus = "idle" | "loading-model" | "ready" | "generating" | "failed";

export interface ModelLoadProgress {
  progress: number;
  text: string;
}

export interface ExplainParams {
  direction: Direction;
  input: string;
  dictionaryContext: DictionaryEntry[];
  signal?: AbortSignal;
}

export interface AiEngine {
  getStatus(): AiStatus;
  ensureReady(
    onStatus?: (status: AiStatus) => void,
    onProgress?: (progress: ModelLoadProgress) => void,
  ): Promise<void>;
  explain(params: ExplainParams): Promise<AiExplanationOutput>;
  dispose(): void;
}

export function isWebGpuSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** Deletes every downloadable model's cached weights/config from browser
 * storage, not just the currently selected one, so switching models earlier
 * can't leave stale weights behind after "Clear local cache". Tolerates a
 * model that was never downloaded. */
export async function clearAllModelCaches(): Promise<void> {
  const { deleteModelAllInfoInCache } = await loadWebLlm();
  await Promise.all(
    MODEL_OPTIONS.map((option) => deleteModelAllInfoInCache(option.id).catch(() => undefined)),
  );
}

/** Strips ```json fences a model may add despite instructions not to. */
function extractJsonPayload(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? text).trim();
}

/**
 * Creates a facade around a browser-local WebLLM engine running in a Web
 * Worker. The rest of the app should only ever call through this facade
 * (`ensureReady` / `explain`) and never touch `@mlc-ai/web-llm` directly.
 */
export function createLocalAiEngine(modelId: string = DEFAULT_MODEL_ID): AiEngine {
  let status: AiStatus = "idle";
  let engine: MLCEngineInterface | null = null;
  let worker: Worker | null = null;
  let initPromise: Promise<void> | null = null;
  /** Rejects any in-flight explain() immediately when dispose() runs, so a
   * terminated Worker can never leave that call hanging forever. */
  let disposeReject: ((reason: unknown) => void) | null = null;

  async function ensureReady(
    onStatus?: (status: AiStatus) => void,
    onProgress?: (progress: ModelLoadProgress) => void,
  ): Promise<void> {
    const setStatus = (next: AiStatus) => {
      status = next;
      onStatus?.(next);
    };

    if (status === "ready") return;
    if (initPromise) return initPromise;

    if (!isWebGpuSupported()) {
      setStatus("failed");
      throw new Error("webgpu-unavailable");
    }

    setStatus("loading-model");
    initPromise = (async () => {
      const { CreateWebWorkerMLCEngine } = await loadWebLlm();
      worker = new Worker(new URL("./llm-worker.ts", import.meta.url), { type: "module" });
      engine = await CreateWebWorkerMLCEngine(worker, modelId, {
        initProgressCallback: (report) => {
          onProgress?.({ progress: report.progress, text: report.text });
        },
      });
      setStatus("ready");
    })().catch((error: unknown) => {
      setStatus("failed");
      // Let a future ensureReady() call retry instead of replaying the same
      // rejected promise forever.
      initPromise = null;
      throw error;
    });

    return initPromise;
  }

  async function runGeneration(
    activeEngine: MLCEngineInterface,
    params: ExplainParams,
  ): Promise<AiExplanationOutput> {
    const onAbort = () => activeEngine.interruptGenerate();
    params.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const stream = await activeEngine.chat.completions.create({
        stream: true,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(params) },
        ],
      });

      let accumulated = "";
      for await (const chunk of stream) {
        if (params.signal?.aborted) {
          throw new DOMException("Generation cancelled", "AbortError");
        }
        accumulated += chunk.choices[0]?.delta?.content ?? "";
      }

      if (params.signal?.aborted) {
        throw new DOMException("Generation cancelled", "AbortError");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJsonPayload(accumulated));
      } catch {
        throw new Error("generation-invalid-json");
      }

      const validated = validateAiExplanationOutput(parsed);
      if (!validated) {
        throw new Error("generation-invalid-json");
      }
      return validated;
    } finally {
      params.signal?.removeEventListener("abort", onAbort);
    }
  }

  async function explain(params: ExplainParams): Promise<AiExplanationOutput> {
    if (!engine) {
      throw new Error("AI engine is not ready; call ensureReady() first.");
    }
    const activeEngine = engine;
    status = "generating";

    const disposal = new Promise<never>((_resolve, reject) => {
      disposeReject = reject;
    });

    try {
      return await Promise.race([runGeneration(activeEngine, params), disposal]);
    } finally {
      disposeReject = null;
      if (status === "generating") {
        status = "ready";
      }
    }
  }

  function dispose(): void {
    disposeReject?.(new Error("AI engine was disposed"));
    disposeReject = null;
    worker?.terminate();
    worker = null;
    engine = null;
    initPromise = null;
    status = "idle";
  }

  return {
    getStatus: () => status,
    ensureReady,
    explain,
    dispose,
  };
}
