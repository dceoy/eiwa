import type { Direction } from "./language";
import type { AiEngine } from "./llm";

/** Uses only an already-ready local engine; never downloads or calls a server.
 * A failed check is auxiliary and must not affect the original lookup. */
export async function backTranslate(
  engine: AiEngine,
  direction: Direction,
  translation: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (engine.getStatus() !== "ready" || !translation.trim() || signal?.aborted) return null;
  try {
    const output = await engine.explain({
      direction: direction === "en-ja" ? "ja-en" : "en-ja",
      input: translation,
      dictionaryContext: [],
      signal,
    });
    return signal?.aborted ? null : output.translation.primary.trim() || null;
  } catch {
    return null;
  }
}
