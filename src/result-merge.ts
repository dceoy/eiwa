import type { DictionaryEntry } from "./dict-types";
import { lookupError } from "./errors";
import type { Direction } from "./language";
import type { AiExplanationOutput, EiwaResult } from "./result-schema";

export interface MergeInput {
  direction: Direction;
  input: string;
  dictionaryEntries: DictionaryEntry[];
  ai: AiExplanationOutput | null;
  extraWarnings?: string[];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.trim().length > 0))];
}

/**
 * Deterministically merges dictionary facts with an (optional) AI
 * explanation. Dictionary-sourced fields (dictionary, etymology,
 * pronunciation, derivedWords) are always derived from
 * `dictionaryEntries` alone and are never influenced by `ai`, so a
 * malformed or absent AI response can never erase or override a
 * dictionary fact.
 */
export function mergeResult({
  direction,
  input,
  dictionaryEntries,
  ai,
  extraWarnings = [],
}: MergeInput): EiwaResult {
  const bestEntry = dictionaryEntries[0];
  // Related headwords are navigational results, not alternative meanings of
  // an exact hit (e.g. catsup must not become a translation of cat).
  const translationEntries = dictionaryEntries.filter(
    (entry) => entry.match?.kind === bestEntry?.match?.kind,
  );
  const dictTranslations = translationEntries.flatMap((entry) =>
    [...entry.translations]
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((t) => t.text),
  );

  const primary = dictTranslations[0] || ai?.translation.primary || "";
  const alternatives = uniqueStrings(
    dictionaryEntries.length > 0
      ? dictTranslations.filter((t) => t !== primary)
      : (ai?.translation.alternatives ?? []),
  );

  // A miss with no AI output is a normal (not error) outcome, but the user
  // still needs to know the lookup ran and found nothing rather than seeing
  // a silently blank result.
  const missWarning =
    dictionaryEntries.length === 0 && ai === null ? [lookupError("dictionary-miss").message] : [];

  return {
    direction,
    input,
    translation: { primary, alternatives },
    aiTranslation: ai?.translation ?? null,
    correction: ai?.correction ?? { corrected: null, explanation: null },
    nuance: ai?.nuance ?? [],
    dictionary: dictionaryEntries,
    etymology: dictionaryEntries.find((e) => e.etymology)?.etymology ?? null,
    pronunciation: bestEntry?.pronunciation ?? null,
    derivedWords: uniqueStrings(dictionaryEntries.flatMap((e) => e.derivedWords ?? [])),
    warnings: uniqueStrings([...(ai?.warnings ?? []), ...extraWarnings, ...missWarning]),
    sourceKinds: [
      ...(dictionaryEntries.length > 0 ? (["dictionary"] as const) : []),
      ...(ai ? (["ai"] as const) : []),
    ],
  };
}
