import type { DictionaryEntry } from "./dict-types";
import type { Direction } from "./language";

export type SourceKind = "dictionary" | "ai";

export interface TranslationResult {
  primary: string;
  alternatives: string[];
}

export interface CorrectionResult {
  corrected: string | null;
  explanation: string | null;
}

export interface PronunciationInfo {
  ipa?: string;
  kana?: string;
  audioText?: string;
}

export interface EiwaResult {
  direction: Direction;
  input: string;
  translation: TranslationResult;
  correction: CorrectionResult;
  nuance: string[];
  dictionary: DictionaryEntry[];
  etymology: string | null;
  pronunciation: PronunciationInfo | null;
  derivedWords: string[];
  warnings: string[];
  sourceKinds: SourceKind[];
}

/**
 * The subset of EiwaResult that WebLLM is asked to produce. Dictionary
 * facts (dictionary entries, etymology, pronunciation, derived words) are
 * intentionally excluded: they only ever come from `dict.ts`, so the model
 * cannot overwrite or invent them.
 */
export interface AiExplanationOutput {
  translation: TranslationResult;
  correction: CorrectionResult;
  nuance: string[];
  warnings: string[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Validates and coerces an untrusted (model-generated) JSON value into an
 * AiExplanationOutput. Returns null when the shape cannot be trusted, so
 * callers can fall back to dictionary-only rendering instead of showing
 * malformed data.
 */
export function validateAiExplanationOutput(value: unknown): AiExplanationOutput | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;

  const translation = obj.translation as Record<string, unknown> | undefined;
  if (typeof translation !== "object" || translation === null) return null;
  if (typeof translation.primary !== "string") return null;
  const alternatives = isStringArray(translation.alternatives) ? translation.alternatives : [];

  const correctionRaw = obj.correction as Record<string, unknown> | undefined;
  const corrected = typeof correctionRaw?.corrected === "string" ? correctionRaw.corrected : null;
  const explanation =
    typeof correctionRaw?.explanation === "string" ? correctionRaw.explanation : null;

  const nuance = isStringArray(obj.nuance) ? obj.nuance : [];
  const warnings = isStringArray(obj.warnings) ? obj.warnings : [];

  return {
    translation: { primary: translation.primary, alternatives },
    correction: { corrected, explanation },
    nuance,
    warnings,
  };
}
