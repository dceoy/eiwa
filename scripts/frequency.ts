/** Production-only, content-pinned subtitle frequency data. No runtime fetches. */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeHeadword } from "../src/dict-normalize";
import type { DictionaryEntry, DictionarySource, DictLang } from "../src/dict-types";

export const FREQUENCY_REVISION = "525f9b560de45753a5ea01069454e72e9aa541c6";
export const FREQUENCY_SOURCE: DictionarySource = {
  name: "FrequencyWords — Hermit Dave; OPUS OpenSubtitles (EN 2018, JA 2016)",
  license: "CC BY-SA 4.0",
  url: `https://github.com/hermitdave/FrequencyWords/tree/${FREQUENCY_REVISION}`,
};
export const FREQUENCY_PINS = {
  en: { year: "2018", sha256: "5351ff405b1126ef555791dd4d9798a48e3e9a501a9fc481a9da957752cfb458" },
  ja: { year: "2016", sha256: "6f734851c4881295d66947e09987ccb17010bb71cd9df7b6e326870c847508d6" },
};
const CACHE = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  ".cache",
  "frequency",
);
export function parseFrequency(text: string, lang: DictLang): Map<string, number> {
  const scores = new Map<string, number>();
  for (const line of text.trim().split(/\r?\n/)) {
    const match = /^(\S+) ([0-9]+)$/.exec(line);
    if (!match?.[1] || !match[2]) throw new Error("Malformed frequency row");
    const word = normalizeHeadword(match[1], lang);
    const score = Math.round(1000 * Math.log10(1 + Number(match[2])));
    scores.set(word, Math.max(scores.get(word) ?? 0, score));
  }
  return scores;
}
export async function loadFrequency(lang: DictLang): Promise<Map<string, number>> {
  const pin = FREQUENCY_PINS[lang];
  const file = path.join(CACHE, `${lang}.txt`);
  const verify = (text: string) => {
    if (createHash("sha256").update(text).digest("hex") !== pin.sha256)
      throw new Error(`Frequency ${lang} checksum mismatch`);
    return parseFrequency(text, lang);
  };
  try {
    return verify(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const url = `https://raw.githubusercontent.com/hermitdave/FrequencyWords/${FREQUENCY_REVISION}/content/${pin.year}/${lang}/${lang}_50k.txt`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Frequency download: HTTP ${response.status}`);
  const text = await response.text();
  const scores = verify(text);
  await mkdir(CACHE, { recursive: true });
  const partial = `${file}.part`;
  try {
    await writeFile(partial, text);
    await rename(partial, file);
  } finally {
    await rm(partial, { force: true });
  }
  return scores;
}

export function frequencyScore(text: string, lang: DictLang, scores: Map<string, number>): number {
  const word = normalizeHeadword(text, lang);
  if (scores.has(word)) return scores.get(word) ?? 0;
  // Phrase score is the least frequent token, not a made-up phrase count.
  if (lang === "en" && word.includes(" "))
    return Math.min(...word.split(" ").map((token) => scores.get(token) ?? 0));
  return 0;
}
export function rankEntries(
  en: DictionaryEntry[],
  ja: DictionaryEntry[],
  enScores: Map<string, number>,
  jaScores: Map<string, number>,
) {
  const jaRank = new Map<string, number>();
  for (const entry of ja) {
    // JMdict priority is primary; corpus count breaks ties. The bands do
    // not overlap (frequencyScore is <10000 for these published corpora).
    entry.frequency = (entry.frequency ?? 0) + frequencyScore(entry.headword, "ja", jaScores);
    // Reverse English lookup ranks Japanese gloss candidates by corpus
    // frequency first, JMdict commonness as a tie-breaker. Do NOT reorder
    // senses by token counts: "geisha" being frequent cannot make it the
    // primary meaning of 猫. JMdict's authored sense order is preserved.
    const reverseScore =
      frequencyScore(entry.headword, "ja", jaScores) * 1000 + entry.frequency / 1000;
    jaRank.set(entry.headword, Math.max(jaRank.get(entry.headword) ?? 0, reverseScore));
  }
  for (const entry of en) {
    entry.headwordFrequency = frequencyScore(entry.headword, "en", enScores);
    entry.frequency = Math.max(...entry.translations.map((t) => jaRank.get(t.text) ?? 0));
    for (const translation of entry.translations)
      translation.priority = -(jaRank.get(translation.text) ?? 0);
    entry.translations.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    entry.translations = entry.translations.slice(0, 3);
    for (const sense of entry.senses) sense.translation = entry.translations[0]?.text;
  }
}
