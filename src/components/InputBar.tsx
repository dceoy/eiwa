import { useEffect, useRef, useState } from "preact/hooks";
import { suggestHeadwords } from "../dict";
import { type Direction, detectDirection, sourceLangFor } from "../language";

export type DirectionChoice = "auto" | Direction;

const DIRECTION_OPTIONS: { value: DirectionChoice; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "en-ja", label: "EN → JA" },
  { value: "ja-en", label: "JA → EN" },
];

export interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  direction: DirectionChoice;
  onDirectionChange: (direction: DirectionChoice) => void;
  onSubmit: (candidate?: string) => void;
  onClear: () => void;
  onCancel: () => void;
  busy: boolean;
}

export function InputBar({
  value,
  onChange,
  direction,
  onDirectionChange,
  onSubmit,
  onClear,
  onCancel,
  busy,
}: InputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setCandidates([]);
    const selected = direction === "auto" ? detectDirection(value) : direction;
    if (!focused || composing || !selected || busy) return;
    const timer = setTimeout(() => {
      void suggestHeadwords(value, sourceLangFor(selected))
        .then((words) => {
          if (!cancelled) setCandidates(words);
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, direction, focused, composing, busy]);

  // Re-run whenever `value` changes (not just on mount) so programmatic
  // updates — e.g. Clear resetting the value via props rather than a DOM
  // input event — also shrink the textarea back down.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);

  return (
    <form
      class="input-bar"
      onFocusOut={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <fieldset class="direction-toggle">
        <legend class="visually-hidden">Translation direction</legend>
        {DIRECTION_OPTIONS.map((option) => (
          <label
            key={option.value}
            class={`direction-option${direction === option.value ? " is-active" : ""}`}
          >
            <input
              type="radio"
              name="direction"
              class="visually-hidden"
              value={option.value}
              checked={direction === option.value}
              onChange={() => onDirectionChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <label class="visually-hidden" for="eiwa-input">
        English or Japanese word, phrase, or sentence
      </label>
      <textarea
        id="eiwa-input"
        ref={textareaRef}
        class="input-textarea"
        placeholder="Type English or Japanese…"
        value={value}
        rows={1}
        autocomplete="off"
        autocorrect="off"
        spellcheck={false}
        onFocus={() => setFocused(true)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        aria-describedby={candidates.length ? "headword-suggestions" : undefined}
        onInput={(event) => {
          const target = event.currentTarget;
          onChange(target.value);
          target.style.height = "auto";
          target.style.height = `${Math.min(target.scrollHeight, 240)}px`;
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !busy &&
            !event.isComposing &&
            !composing
          ) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />

      {candidates.length > 0 && (
        <section
          id="headword-suggestions"
          class="search-suggestions"
          aria-label="Headword suggestions"
        >
          <span>Headwords: </span>
          {candidates.map((word) => (
            <button
              type="button"
              key={word}
              class="btn btn-ghost"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setCandidates([]);
                onSubmit(word);
              }}
            >
              {word}
            </button>
          ))}
        </section>
      )}

      <div class="input-actions">
        {busy ? (
          <button type="button" class="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button type="submit" class="btn btn-primary" disabled={value.trim() === ""}>
            Translate
          </button>
        )}
        <button
          type="button"
          class="btn btn-ghost"
          onClick={onClear}
          disabled={value === "" && !busy}
        >
          Clear
        </button>
      </div>
    </form>
  );
}
