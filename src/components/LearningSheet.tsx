import { useState } from "preact/hooks";
import {
  exportWordbook,
  type HistoryItem,
  MAX_IMPORT_BYTES,
  mergeWordbook,
  moveWord,
  parseWordbook,
  type SavedWord,
  wordId,
} from "../learning";
import { ModalOverlay } from "./ModalOverlay";

export interface LearningSheetProps {
  words: SavedWord[];
  onWords: (words: SavedWord[]) => boolean;
  onReopen: (word: SavedWord) => void;
  history: HistoryItem[];
  historyOn: boolean;
  onHistoryToggle: (enabled: boolean) => void;
  onHistory: (items: HistoryItem[]) => void;
  onLookup: (item: HistoryItem) => void;
  onClose: () => void;
}
export function LearningSheet(props: LearningSheetProps) {
  const [message, setMessage] = useState("");
  return (
    <ModalOverlay onClose={props.onClose} labelledBy="learning-heading">
      <header class="sheet-header">
        <h2 id="learning-heading">Wordbook &amp; history</h2>
        <button type="button" class="icon-btn" onClick={props.onClose} aria-label="Close wordbook">
          ✕
        </button>
      </header>
      <section class="settings-section" aria-label="Saved words">
        <h3>Wordbook</h3>
        <p class="settings-note">
          Dictionary snapshots saved on this device. Reopening never refreshes the saved content. No
          accounts or sync. Export a backup before clearing browser storage.
        </p>
        <button
          type="button"
          class="btn btn-secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([exportWordbook(props.words)], { type: "application/json" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = "eiwa-wordbook.json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Export JSON
        </button>
        <label class="import-label">
          Import JSON (merge, up to 4 MiB)
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              if (file.size > MAX_IMPORT_BYTES) {
                setMessage("Wordbook exceeds 4 MiB.");
                return;
              }
              void file
                .text()
                .then((text) => {
                  const words = mergeWordbook(props.words, parseWordbook(text));
                  if (props.onWords(words))
                    setMessage("Imported. Existing snapshots kept; new entries appended.");
                })
                .catch(() => setMessage("Import failed: invalid wordbook. Nothing changed."));
            }}
          />
        </label>
        {message && <p role="status">{message}</p>}
        {props.words.length === 0 && <p>No saved words yet.</p>}
        <ol class="saved-words">
          {props.words.map((word, i) => (
            <li key={word.id}>
              <button type="button" class="btn btn-ghost" onClick={() => props.onReopen(word)}>
                {word.input} · {word.direction === "en-ja" ? "EN→JA" : "JA→EN"}
              </button>
              <p>{word.dictionary[0]?.senses[0]?.gloss}</p>
              <small>Saved {new Date(word.savedAt).toLocaleString()}</small>
              <div class="word-actions">
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={`Move ${word.input} up`}
                  disabled={i === 0}
                  onClick={() => props.onWords(moveWord(props.words, i, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={`Move ${word.input} down`}
                  disabled={i === props.words.length - 1}
                  onClick={() => props.onWords(moveWord(props.words, i, 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={`Delete saved ${word.input}`}
                  onClick={() => props.onWords(props.words.filter((w) => w.id !== word.id))}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section class="settings-section" aria-label="Lookup history">
        <h3>History</h3>
        <label class="toggle-row">
          Remember lookup history on this device
          <input
            type="checkbox"
            checked={props.historyOn}
            onChange={(e) => props.onHistoryToggle(e.currentTarget.checked)}
          />
        </label>
        <p class="settings-note">
          Off by default. Up to 50 recent queries; switching off erases history.
        </p>
        <button
          type="button"
          class="btn btn-secondary"
          disabled={!props.history.length}
          onClick={() => props.onHistory([])}
        >
          Clear all history
        </button>
        <ul>
          {props.history.map((item) => (
            <li key={wordId(item)}>
              <button type="button" class="btn btn-ghost" onClick={() => props.onLookup(item)}>
                {item.input} · {item.direction === "en-ja" ? "EN→JA" : "JA→EN"}
              </button>
              <button
                type="button"
                class="icon-btn"
                aria-label={`Delete history ${item.input}`}
                onClick={() =>
                  props.onHistory(props.history.filter((h) => wordId(h) !== wordId(item)))
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </ModalOverlay>
  );
}
