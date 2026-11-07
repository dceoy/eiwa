import type { DictLang } from "./dict-types";

export const MAX_SHARD_HASH_DEPTH = 8;

/** Stable FNV-1a over UTF-16; shared by the builder and browser, not a checksum. */
function routingHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(MAX_SHARD_HASH_DEPTH, "0");
}

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
export function shardKeyFor(normalized: string, lang: DictLang, hashDepth = 0): string {
  const first = [...normalized][0] ?? "";
  const base = lang === "en" ? (/[a-z]/.test(first) ? first : "_") : first || "_";
  return hashDepth > 0 ? `${base}~${routingHash(normalized).slice(0, hashDepth)}` : base;
}

/** A split replaces its parent. Resolve the deepest manifest leaf, never guess a file. */
export function resolveShardKey(
  normalized: string,
  lang: DictLang,
  keys: ReadonlySet<string>,
): string | undefined {
  for (let depth = MAX_SHARD_HASH_DEPTH; depth >= 0; depth -= 1) {
    const key = shardKeyFor(normalized, lang, depth);
    if (keys.has(key)) return key;
  }
  return undefined;
}
