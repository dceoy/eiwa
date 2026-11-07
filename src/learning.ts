import { normalizeHeadword } from "./dict-normalize";
import type { DictionaryEntry } from "./dict-types";
import { validateDictionaryEntry } from "./dict-validate";
import type { Direction } from "./language";
import { mergeResult } from "./result-merge";
import type { EiwaResult } from "./result-schema";

export const WORDBOOK_KEY = "eiwa:wordbook:v1";
export const HISTORY_KEY = "eiwa:history:v1";
export const HISTORY_ENABLED_KEY = "eiwa:history-enabled:v1";
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_SAVED = 200;
export interface SavedWord {
  id: string;
  input: string;
  direction: Direction;
  savedAt: string;
  dictionary: DictionaryEntry[];
}
export interface HistoryItem {
  input: string;
  direction: Direction;
}
export function wordId(item: HistoryItem): string {
  return `${item.direction}:${normalizeHeadword(item.input, item.direction === "en-ja" ? "en" : "ja")}`;
}
export function snapshot(result: EiwaResult): SavedWord {
  return JSON.parse(
    JSON.stringify({
      id: wordId(result),
      input: result.input,
      direction: result.direction,
      savedAt: new Date().toISOString(),
      dictionary: result.dictionary,
    }),
  ) as SavedWord;
}
export function reopen(word: SavedWord): EiwaResult {
  return mergeResult({
    input: word.input,
    direction: word.direction,
    dictionaryEntries: word.dictionary,
    ai: null,
  });
}
function isItem(value: unknown): value is HistoryItem & Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const item = value as HistoryItem;
  return (
    typeof item.input === "string" &&
    item.input.trim().length > 0 &&
    item.input.length <= 2000 &&
    (item.direction === "en-ja" || item.direction === "ja-en")
  );
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}
function safeLink(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && /^https?:\/\//.test(value));
}
/** Imports are untrusted files: validate every field consumed by ResultView. */
function isEntry(value: unknown): value is DictionaryEntry {
  if (validateDictionaryEntry(value, "entry").length) return false;
  const e = value as DictionaryEntry;
  return (
    strings(e.pos) &&
    (e.reading === undefined || typeof e.reading === "string") &&
    e.translations.every(
      (t) => t && typeof t.text === "string" && (t.lang === "en" || t.lang === "ja"),
    ) &&
    e.senses.every(
      (s) =>
        s &&
        typeof s.gloss === "string" &&
        (s.tags === undefined || strings(s.tags)) &&
        (s.examples === undefined || strings(s.examples)),
    ) &&
    e.source.every(
      (s) =>
        s &&
        typeof s.name === "string" &&
        typeof s.license === "string" &&
        safeLink(s.url) &&
        safeLink(s.licenseUrl) &&
        (s.attribution === undefined || typeof s.attribution === "string"),
    ) &&
    (e.pronunciation === undefined ||
      (e.pronunciation !== null &&
        typeof e.pronunciation === "object" &&
        [e.pronunciation.kana, e.pronunciation.audioText].every(
          (v) => v === undefined || typeof v === "string",
        ))) &&
    (e.match === undefined ||
      (e.match !== null &&
        ["inflection", "prefix", "partial"].includes(e.match.kind) &&
        typeof e.match.query === "string"))
  );
}
export function exportWordbook(words: SavedWord[]): string {
  return JSON.stringify({ schemaVersion: 1, words }, null, 2);
}
export function parseWordbook(text: string): SavedWord[] {
  if (new Blob([text]).size > MAX_IMPORT_BYTES) throw new Error("Wordbook exceeds 4 MiB.");
  const data = JSON.parse(text) as { schemaVersion?: unknown; words?: unknown } | null;
  if (data?.schemaVersion !== 1 || !Array.isArray(data.words) || data.words.length > MAX_SAVED)
    throw new Error("Invalid wordbook (expected version 1, up to 200 entries).");
  const ids = new Set<string>();
  for (const word of data.words) {
    if (
      !isItem(word) ||
      typeof word.savedAt !== "string" ||
      !Number.isFinite(Date.parse(word.savedAt)) ||
      word.id !== wordId(word) ||
      ids.has(word.id) ||
      !Array.isArray(word.dictionary) ||
      !word.dictionary.length ||
      word.dictionary.length > 30 ||
      !word.dictionary.every(isEntry)
    )
      throw new Error("Invalid wordbook entry.");
    ids.add(word.id);
  }
  return data.words as SavedWord[];
}
export function mergeWordbook(current: SavedWord[], imported: SavedWord[]): SavedWord[] {
  const ids = new Set(current.map((w) => w.id));
  const merged = [...current, ...imported.filter((w) => !ids.has(w.id))];
  if (merged.length > MAX_SAVED) throw new Error("Wordbook is full (200 entries).");
  return merged;
}
export function moveWord(words: SavedWord[], index: number, delta: number): SavedWord[] {
  const target = index + delta;
  if (index < 0 || index >= words.length || target < 0 || target >= words.length) return words;
  const next = [...words];
  [next[index], next[target]] = [next[target] as SavedWord, next[index] as SavedWord];
  return next;
}
export function loadWordbook(): SavedWord[] {
  const raw = localStorage.getItem(WORDBOOK_KEY);
  return raw ? parseWordbook(raw) : [];
}
export function saveWordbook(words: SavedWord[]): void {
  const json = exportWordbook(words);
  parseWordbook(json);
  localStorage.setItem(WORDBOOK_KEY, json);
}
export function historyEnabled(): boolean {
  try {
    return localStorage.getItem(HISTORY_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}
export function loadHistory(): HistoryItem[] {
  if (!historyEnabled()) return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter(isItem).slice(0, 50) : [];
  } catch {
    return [];
  }
}
export function addHistory(items: HistoryItem[], item: HistoryItem): HistoryItem[] {
  return [item, ...items.filter((h) => wordId(h) !== wordId(item))].slice(0, 50);
}
