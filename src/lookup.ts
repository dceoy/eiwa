import { lookupDictionary } from "./dict";
import type { DictionaryEntry } from "./dict-types";
import { type LookupError, lookupError } from "./errors";
import { type Direction, detectDirection, sourceLangFor } from "./language";
import type { AiEngine, AiStatus } from "./llm";
import { normalizeInput } from "./normalize";
import { mergeResult } from "./result-merge";
import type { EiwaResult } from "./result-schema";

export type LookupEvent =
  | { type: "direction"; direction: Direction }
  | { type: "dictionary"; entries: DictionaryEntry[] }
  | { type: "ai-status"; status: AiStatus }
  | { type: "result"; result: EiwaResult }
  | { type: "error"; error: LookupError }
  | { type: "cancelled" };

export interface LookupOptions {
  signal?: AbortSignal;
  /**
   * An already-initialized AI engine, or null/undefined to skip AI entirely.
   * `lookup()` never triggers model loading itself — that only happens via
   * explicit user action elsewhere (see `llm.ts`) — it only uses the engine
   * if it reports itself as already `ready`.
   */
  aiEngine?: AiEngine | null;
  /** Forces a direction instead of auto-detecting from script (the UI's Auto/EN→JA/JA→EN control). */
  direction?: Direction;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Orchestrates a single lookup: normalize -> detect direction -> dictionary
 * lookup (renders immediately) -> optional AI explanation (renders
 * progressively). This is the only module aware of both the dictionary and
 * WebLLM; UI components should only ever consume `LookupEvent`s from here.
 */
export async function* lookup(
  rawInput: string,
  options: LookupOptions = {},
): AsyncGenerator<LookupEvent> {
  const { signal, aiEngine } = options;
  const normalized = normalizeInput(rawInput);

  if (normalized.isEmpty) {
    yield { type: "error", error: lookupError("empty-input") };
    return;
  }

  const direction = options.direction ?? detectDirection(normalized.text);
  if (!direction) {
    yield { type: "error", error: lookupError("unsupported-language") };
    return;
  }
  yield { type: "direction", direction };

  let entries: DictionaryEntry[] = [];
  try {
    entries = await lookupDictionary(normalized.text, sourceLangFor(direction));
  } catch {
    yield { type: "error", error: lookupError("network-unavailable-for-dictionary-shard") };
  }
  yield { type: "dictionary", entries };

  if (signal?.aborted) {
    yield { type: "cancelled" };
    return;
  }

  const aiStatus = aiEngine?.getStatus() ?? "idle";
  yield { type: "ai-status", status: aiStatus };

  if (!aiEngine || aiStatus !== "ready") {
    yield {
      type: "result",
      result: mergeResult({
        direction,
        input: normalized.text,
        dictionaryEntries: entries,
        ai: null,
      }),
    };
    return;
  }

  yield { type: "ai-status", status: "generating" };
  try {
    const ai = await aiEngine.explain({
      direction,
      input: normalized.text,
      dictionaryContext: entries,
      signal,
    });

    if (signal?.aborted) {
      yield { type: "cancelled" };
      return;
    }

    yield {
      type: "result",
      result: mergeResult({ direction, input: normalized.text, dictionaryEntries: entries, ai }),
    };
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      yield { type: "cancelled" };
      return;
    }

    const code =
      error instanceof Error && error.message === "generation-invalid-json"
        ? "generation-invalid-json"
        : "model-load-failed";
    const failure = lookupError(code);
    yield { type: "error", error: failure };
    yield {
      type: "result",
      result: mergeResult({
        direction,
        input: normalized.text,
        dictionaryEntries: entries,
        ai: null,
        extraWarnings: [failure.message],
      }),
    };
  }
}
