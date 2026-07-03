export type Direction = "en-ja" | "ja-en";

const JAPANESE_SCRIPT_RE = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾝ]/;
const LATIN_LETTER_RE = /[A-Za-z]/;

/**
 * Detects translation direction from script alone: any Japanese script
 * (hiragana/katakana/kanji) means Japanese input; otherwise Latin letters
 * mean English input. Returns null when neither script is present (e.g.
 * digits-only, emoji-only, or another script entirely) — this MVP only
 * supports English and Japanese.
 */
export function detectDirection(input: string): Direction | null {
  if (JAPANESE_SCRIPT_RE.test(input)) {
    return "ja-en";
  }
  if (LATIN_LETTER_RE.test(input)) {
    return "en-ja";
  }
  return null;
}

export function sourceLangFor(direction: Direction): "en" | "ja" {
  return direction === "en-ja" ? "en" : "ja";
}

export function targetLangFor(direction: Direction): "en" | "ja" {
  return direction === "en-ja" ? "ja" : "en";
}
