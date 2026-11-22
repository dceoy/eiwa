import { normalizeHeadword } from "./dict-normalize";
import type { DictLang } from "./dict-types";

const LETTER_OR_NUMBER_RE = /[\p{L}\p{N}]/u;

const segmenters = {
  en: new Intl.Segmenter("en", { granularity: "word" }),
  ja: new Intl.Segmenter("ja", { granularity: "word" }),
};
export function lookupTokens(text: string, lang: DictLang): string[] {
  return [...segmenters[lang].segment(text)].map((part) => part.segment);
}
const functionWords = new Set(
  "a an the to of in on at by for and or is are be as it its i you he she we they this that with from into than one's".split(
    " ",
  ),
);
export function isLookupToken(text: string, lang: DictLang): boolean {
  return (
    LETTER_OR_NUMBER_RE.test(text) && (lang !== "en" || !functionWords.has(tokenKey(text, lang)))
  );
}
export function tokenKey(text: string, lang: DictLang): string {
  return normalizeHeadword(text, lang);
}
