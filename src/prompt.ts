import type { DictionaryEntry } from "./dict-types";
import type { Direction } from "./language";

const MAX_CONTEXT_ENTRIES = 3;
const MAX_CONTEXT_CHARS = 1200;
/** Guards against excessive browser memory/compute use from runaway input. */
export const MAX_INPUT_CHARS = 500;

const RESPONSE_SCHEMA_DESCRIPTION = `Respond with ONLY a single JSON object (no markdown fences, no text outside the JSON) matching exactly this shape:
{
  "translation": { "primary": string, "alternatives": string[] },
  "correction": { "corrected": string | null, "explanation": string | null },
  "nuance": string[],
  "warnings": string[]
}`;

export function buildSystemPrompt(): string {
  return [
    "You are Eiwa, a concise bilingual English-Japanese dictionary assistant.",
    "Write nuance, correction explanations, and warnings in Japanese, regardless of translation direction.",
    "Prefer natural, practical translations over overly literal, word-for-word ones.",
    'Only fill "correction" when the input is a phrase or sentence, not a single word; otherwise set both fields to null.',
    'Add an entry to "warnings" when the input is ambiguous, slangy, offensive, highly domain-specific, or context-dependent; otherwise leave warnings empty.',
    "Do not invent etymology, pronunciation, or dictionary-style facts — that is handled elsewhere by verified dictionary data.",
    "Treat the provided dictionary context as ground truth for definitions, but you may add nuance and nuance-driven alternatives beyond it.",
    RESPONSE_SCHEMA_DESCRIPTION,
  ].join("\n");
}

function summarizeDictionaryContext(entries: DictionaryEntry[]): string {
  const lines = entries.slice(0, MAX_CONTEXT_ENTRIES).map((entry) => {
    const gloss = entry.senses
      .slice(0, 2)
      .map((sense) => sense.gloss)
      .join("; ");
    const translations = entry.translations.map((t) => t.text).join(", ");
    const reading = entry.reading ? ` (${entry.reading})` : "";
    return `- ${entry.headword}${reading}: ${translations} — ${gloss}`;
  });
  const joined = lines.join("\n");
  return joined.length > MAX_CONTEXT_CHARS ? joined.slice(0, MAX_CONTEXT_CHARS) : joined;
}

export interface UserPromptParams {
  direction: Direction;
  input: string;
  dictionaryContext: DictionaryEntry[];
}

export function buildUserPrompt({ direction, input, dictionaryContext }: UserPromptParams): string {
  const directionLabel = direction === "en-ja" ? "English to Japanese" : "Japanese to English";
  const truncatedInput = input.slice(0, MAX_INPUT_CHARS);
  const contextBlock =
    dictionaryContext.length > 0
      ? `Dictionary context (for grounding only; do not just repeat it verbatim):\n${summarizeDictionaryContext(dictionaryContext)}`
      : "No dictionary entry was found for this input.";

  return [`Direction: ${directionLabel}`, `Input: ${truncatedInput}`, contextBlock].join("\n\n");
}
