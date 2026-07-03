import type { DictLang } from "./dict-types";

const FULLWIDTH_TO_HALFWIDTH_RE = /[！-～]/g;
const KATAKANA_RE = /[ァ-ヺ]/g;

function foldFullwidthAscii(text: string): string {
  return text.replace(FULLWIDTH_TO_HALFWIDTH_RE, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}

function katakanaToHiragana(text: string): string {
  return text.replace(KATAKANA_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/**
 * Normalizes a headword or lookup query for a given language so that
 * equivalent inputs (casing, full-width punctuation, katakana/hiragana)
 * resolve to the same dictionary key.
 */
export function normalizeHeadword(raw: string, lang: DictLang): string {
  const trimmed = raw.normalize("NFKC").trim();

  if (lang === "en") {
    return foldFullwidthAscii(trimmed).toLowerCase();
  }

  return katakanaToHiragana(trimmed);
}

/**
 * Derives the shard key a normalized headword should live in.
 * English shards by first ASCII letter; Japanese shards by first
 * (hiragana-folded) character, since most entries carry a kana reading.
 */
export function shardKeyFor(normalized: string, lang: DictLang): string {
  const first = normalized.charAt(0);

  if (lang === "en") {
    return /[a-z]/.test(first) ? first : "_";
  }

  return first || "_";
}
