import { useState } from "preact/hooks";
import { copyToClipboard } from "../clipboard";
import { sourceLangFor, targetLangFor } from "../language";
import { PROVENANCE_LABELS, provenanceFor } from "../provenance";
import type { EiwaResult } from "../result-schema";
import { isSpeechSynthesisSupported, speak } from "../speech";

function ProvenanceTag({ hasDictionary, hasAi }: { hasDictionary: boolean; hasAi: boolean }) {
  const label = provenanceFor(hasDictionary, hasAi);
  if (!label) return null;
  return <span class="provenance-tag">{PROVENANCE_LABELS[label]}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      class="icon-btn"
      aria-label="Copy to clipboard"
      onClick={() => {
        void copyToClipboard(text).then((ok) => {
          if (!ok) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

function SpeakButton({ text, lang }: { text: string; lang: "en" | "ja" }) {
  if (!isSpeechSynthesisSupported() || text.trim() === "") return null;
  return (
    <button
      type="button"
      class="icon-btn"
      aria-label={`Listen (${lang === "en" ? "English" : "Japanese"})`}
      onClick={() => speak(text, lang)}
    >
      🔊
    </button>
  );
}

export function ResultView({ result }: { result: EiwaResult }) {
  const hasDict = result.dictionary.length > 0;
  const hasAi = result.sourceKinds.includes("ai");
  const targetLang = targetLangFor(result.direction);
  const sourceLang = sourceLangFor(result.direction);
  const examples = result.dictionary.flatMap((entry) =>
    entry.senses.flatMap((sense) => sense.examples ?? []),
  );
  const sources = [
    ...new Map(
      result.dictionary.flatMap((e) => e.source).map((s) => [`${s.name}::${s.license}`, s]),
    ).values(),
  ];

  return (
    <div class="result-view">
      {result.translation.primary !== "" && (
        <section class="card" aria-labelledby="translation-heading">
          <header class="card-header">
            <h2 id="translation-heading">Translation</h2>
            <ProvenanceTag hasDictionary={hasDict} hasAi={hasAi} />
          </header>
          <p class="translation-primary">
            <span>{result.translation.primary}</span>
            <CopyButton text={result.translation.primary} />
            <SpeakButton text={result.translation.primary} lang={targetLang} />
          </p>
          {result.translation.alternatives.length > 0 && (
            <p class="translation-alternatives">
              Also: {result.translation.alternatives.join(", ")}
            </p>
          )}
        </section>
      )}

      {hasDict && (
        <section class="card" aria-labelledby="dictionary-heading">
          <header class="card-header">
            <h2 id="dictionary-heading">Dictionary</h2>
            <ProvenanceTag hasDictionary hasAi={false} />
          </header>
          <ul class="dictionary-entries">
            {result.dictionary.map((entry) => (
              <li key={entry.id} class="dictionary-entry">
                <div class="dictionary-entry-head">
                  <strong>{entry.headword}</strong>
                  {entry.reading && <span class="reading">（{entry.reading}）</span>}
                  {entry.pos.length > 0 && <span class="pos-tags">{entry.pos.join(", ")}</span>}
                </div>
                <p class="translations">{entry.translations.map((t) => t.text).join(", ")}</p>
                <ol class="senses">
                  {entry.senses.map((sense) => (
                    <li key={sense.gloss}>
                      {sense.gloss}
                      {sense.tags && sense.tags.length > 0 ? ` (${sense.tags.join(", ")})` : ""}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.nuance.length > 0 && (
        <section class="card" aria-labelledby="nuance-heading">
          <header class="card-header">
            <h2 id="nuance-heading">Nuance</h2>
            <ProvenanceTag hasDictionary={false} hasAi={true} />
          </header>
          <ul>
            {result.nuance.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      {(result.correction.corrected !== null || result.correction.explanation !== null) && (
        <section class="card" aria-labelledby="correction-heading">
          <header class="card-header">
            <h2 id="correction-heading">Writing correction</h2>
            <ProvenanceTag hasDictionary={false} hasAi={true} />
          </header>
          {result.correction.corrected !== null && (
            <p class="corrected-text">
              <span>{result.correction.corrected}</span>
              <CopyButton text={result.correction.corrected} />
            </p>
          )}
          {result.correction.explanation !== null && (
            <p class="correction-explanation">{result.correction.explanation}</p>
          )}
        </section>
      )}

      {result.etymology !== null && (
        <section class="card" aria-labelledby="etymology-heading">
          <header class="card-header">
            <h2 id="etymology-heading">Etymology</h2>
            <ProvenanceTag hasDictionary={true} hasAi={false} />
          </header>
          <p class="collapsible-text">{result.etymology}</p>
        </section>
      )}

      {result.pronunciation !== null && (result.pronunciation.ipa || result.pronunciation.kana) && (
        <section class="card" aria-labelledby="pronunciation-heading">
          <header class="card-header">
            <h2 id="pronunciation-heading">Pronunciation</h2>
            <ProvenanceTag hasDictionary={true} hasAi={false} />
          </header>
          <p class="pronunciation">
            {result.pronunciation.ipa && <span class="ipa">{result.pronunciation.ipa}</span>}
            {result.pronunciation.kana && <span class="kana">{result.pronunciation.kana}</span>}
            <SpeakButton text={result.pronunciation.audioText ?? result.input} lang={sourceLang} />
          </p>
        </section>
      )}

      {result.derivedWords.length > 0 && (
        <section class="card" aria-labelledby="derived-heading">
          <header class="card-header">
            <h2 id="derived-heading">Derived words</h2>
            <ProvenanceTag hasDictionary={true} hasAi={false} />
          </header>
          <p>{result.derivedWords.join(", ")}</p>
        </section>
      )}

      {examples.length > 0 && (
        <section class="card" aria-labelledby="examples-heading">
          <header class="card-header">
            <h2 id="examples-heading">Examples</h2>
            <ProvenanceTag hasDictionary={true} hasAi={false} />
          </header>
          <ul>
            {examples.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        </section>
      )}

      {result.warnings.length > 0 && (
        <section class="card card--warning" aria-labelledby="warnings-heading">
          <header class="card-header">
            <h2 id="warnings-heading">Warnings</h2>
          </header>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      {sources.length > 0 && (
        <section class="card card--muted" aria-labelledby="sources-heading">
          <header class="card-header">
            <h2 id="sources-heading">Sources</h2>
          </header>
          <ul class="sources-list">
            {sources.map((source) => (
              <li key={`${source.name}:${source.license}`}>
                {source.name} — {source.license}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
