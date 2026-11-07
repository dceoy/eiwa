import { lookupDictionary } from "./dict";
import type { DictionaryEntry } from "./dict-types";
import { type LookupError, lookupError } from "./errors";
import { type Direction, detectDirection, sourceLangFor } from "./language";
import type { AiEngine, AiStatus } from "./llm";
import { normalizeInput } from "./normalize";
import { MAX_INPUT_CHARS } from "./prompt";
import { mergeResult } from "./result-merge";
import type { AiExplanationOutput, EiwaResult } from "./result-schema";

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

  // The prompt sent to the model truncates input beyond this length (see
  // buildUserPrompt); tell the user so a long paste doesn't silently get a
  // partial AI translation with no indication anything was dropped.
  const truncationWarnings =
    normalized.text.length > MAX_INPUT_CHARS
      ? [`Input was truncated to the first ${MAX_INPUT_CHARS} characters for AI processing.`]
      : [];

  // Dictionary facts paint before the engine boundary. A pending AI lookup
  // must not briefly render the dictionary-miss warning, even on a sentence.
  const initial = mergeResult({
    direction,
    input: normalized.text,
    dictionaryEntries: entries,
    ai: null,
  });
  yield { type: "result", result: { ...initial, warnings: [] } };
  yield { type: "ai-status", status: "generating" };

  const updates: AiExplanationOutput[] = [];
  let wake: (() => void) | undefined;
  let settled = false;
  let final: AiExplanationOutput | undefined;
  let failure: unknown;
  const generation = aiEngine
    .explain({
      direction,
      input: normalized.text,
      dictionaryContext: entries,
      signal,
      onProgress: (output) => {
        if (signal?.aborted) return;
        updates.push(output);
        wake?.();
      },
    })
    .then(
      (output) => {
        final = output;
      },
      (error: unknown) => {
        failure = error;
      },
    )
    .finally(() => {
      settled = true;
      wake?.();
    });

  try {
    while (!settled || updates.length) {
      const ai = updates.shift();
      if (ai && !signal?.aborted) {
        yield {
          type: "result",
          result: mergeResult({
            direction,
            input: normalized.text,
            dictionaryEntries: entries,
            ai,
            extraWarnings: truncationWarnings,
          }),
        };
      } else if (!settled) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    }
    await generation;
    yield { type: "ai-status", status: aiEngine.getStatus() };
    if (signal?.aborted || isAbortError(failure)) {
      yield { type: "cancelled" };
      return;
    }
    // Never replace shown sections with a dictionary-only fallback or insert
    // failure/miss banners when a later section is malformed or interrupted.
    if (final) {
      yield {
        type: "result",
        result: mergeResult({
          direction,
          input: normalized.text,
          dictionaryEntries: entries,
          ai: final,
          extraWarnings: truncationWarnings,
        }),
      };
    }
  } finally {
    // If a consumer stops early, don't retain its queued result snapshots.
    wake = undefined;
  }
}
