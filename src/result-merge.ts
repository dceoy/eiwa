import type { DictionaryEntry } from "./dict-types";
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
  const dictTranslations = dictionaryEntries.flatMap((entry) =>
    [...entry.translations]
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((t) => t.text),
  );

  const primary = ai?.translation.primary || dictTranslations[0] || "";
  const alternatives = uniqueStrings([
    ...(ai?.translation.alternatives ?? []),
    ...dictTranslations.filter((t) => t !== primary),
  ]);

  return {
    direction,
    input,
    translation: { primary, alternatives },
    correction: ai?.correction ?? { corrected: null, explanation: null },
    nuance: ai?.nuance ?? [],
    dictionary: dictionaryEntries,
    etymology: dictionaryEntries.find((e) => e.etymology)?.etymology ?? null,
    pronunciation: bestEntry?.pronunciation ?? null,
    derivedWords: uniqueStrings(dictionaryEntries.flatMap((e) => e.derivedWords ?? [])),
    warnings: uniqueStrings([...(ai?.warnings ?? []), ...extraWarnings]),
    sourceKinds: [
      ...(dictionaryEntries.length > 0 ? (["dictionary"] as const) : []),
      ...(ai ? (["ai"] as const) : []),
    ],
  };
}
