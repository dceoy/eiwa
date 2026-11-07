import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addHistory,
  exportWordbook,
  HISTORY_ENABLED_KEY,
  HISTORY_KEY,
  historyEnabled,
  loadHistory,
  loadWordbook,
  MAX_IMPORT_BYTES,
  mergeWordbook,
  moveWord,
  parseWordbook,
  reopen,
  saveWordbook,
  snapshot,
  WORDBOOK_KEY,
} from "./learning";
import { mergeResult } from "./result-merge";

const result = mergeResult({
  direction: "en-ja",
  input: "cat",
  ai: null,
  dictionaryEntries: [
    {
      id: "en:cat",
      headword: "cat",
      lang: "en",
      pos: ["noun"],
      senses: [{ gloss: "A cat", examples: ["A cat runs."] }],
      translations: [{ text: "猫", lang: "ja" }],
      pronunciation: { ipa: "/kæt/" },
      source: [{ name: "Fixture", license: "CC0" }],
    },
  ],
});
beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("wordbook", () => {
  it("saves immutable dictionary snapshots, reopens offline and excludes AI", () => {
    const original = structuredClone(result);
    const word = snapshot({
      ...original,
      aiTranslation: { primary: "AI", alternatives: [] },
      nuance: ["AI"],
    });
    original.dictionary[0]?.senses.push({ gloss: "Changed upstream" });
    saveWordbook([word]);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("offline");
      }),
    );
    expect(reopen(loadWordbook()[0] ?? word)).toEqual(result);
    expect(exportWordbook([word])).not.toContain('"AI"');
    vi.unstubAllGlobals();
  });
  it("round trips JSON and merges without overwriting or duplicating saved senses", () => {
    const word = snapshot(result);
    expect(parseWordbook(exportWordbook([word]))).toEqual([word]);
    const changed = structuredClone(word);
    changed.dictionary[0]?.senses.push({ gloss: "New" });
    expect(mergeWordbook([word], [changed])).toEqual([word]);
  });
  it("reorders, deletes, persists and guards boundaries", () => {
    const a = snapshot(result),
      b = snapshot({ ...result, input: "other" });
    const moved = moveWord([a, b], 1, -1);
    expect(moved).toEqual([b, a]);
    expect(moveWord(moved, 0, -1)).toEqual(moved);
    saveWordbook(moved.filter((w) => w.id !== a.id));
    expect(loadWordbook()).toEqual([b]);
  });
  it("rejects malformed, duplicate, oversized or unsafe imports atomically", () => {
    const word = snapshot(result);
    saveWordbook([word]);
    for (const value of [
      null,
      {},
      { schemaVersion: 2, words: [] },
      { schemaVersion: 1, words: [word, word] },
      {
        schemaVersion: 1,
        words: [{ ...word, dictionary: [{ ...word.dictionary[0], pos: null }] }],
      },
    ])
      expect(() => parseWordbook(JSON.stringify(value))).toThrow();
    const unsafe = structuredClone(word);
    unsafe.dictionary[0]?.source.push({ name: "Bad", license: "?", url: "javascript:alert(1)" });
    expect(() => parseWordbook(exportWordbook([unsafe]))).toThrow();
    expect(() => parseWordbook(" ".repeat(MAX_IMPORT_BYTES + 1))).toThrow();
    expect(loadWordbook()).toEqual([word]);
  });
  it("surfaces corrupt storage and quota failures instead of overwriting data", () => {
    localStorage.setItem(WORDBOOK_KEY, "invalid");
    expect(() => loadWordbook()).toThrow();
    const storage = localStorage;
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => saveWordbook([snapshot(result)])).toThrow();
    vi.unstubAllGlobals();
    expect(storage.getItem(WORDBOOK_KEY)).toBe("invalid");
  });
});

it("history defaults off and only reads persisted queries after explicit opt-in", () => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify([{ input: "cat", direction: "en-ja" }]));
  expect(historyEnabled()).toBe(false);
  expect(loadHistory()).toEqual([]);
  localStorage.setItem(HISTORY_ENABLED_KEY, "true");
  expect(loadHistory()).toHaveLength(1);
  expect(addHistory(loadHistory(), { input: "CAT", direction: "en-ja" })).toHaveLength(1);
  let items = loadHistory();
  for (let i = 0; i < 60; i++) items = addHistory(items, { input: `word${i}`, direction: "en-ja" });
  expect(items).toHaveLength(50);
});
