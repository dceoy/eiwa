import { useEffect, useState } from "preact/hooks";
import { copyToClipboard } from "../clipboard";
import { resolveHeadwords } from "../dict";
import type { DictLang } from "../dict-types";
import { sourceLangFor, targetLangFor } from "../language";
import { PROVENANCE_LABELS, provenanceFor } from "../provenance";
import { isLookupToken, lookupTokens, tokenKey } from "../relookup";
import type { EiwaResult } from "../result-schema";
import { isSpeechSynthesisSupported, speak } from "../speech";
import { RecordingPlayer } from "./RecordingPlayer";

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

export function ResultView({
  result,
  onLookup,
  onBackTranslate,
  backTranslation,
  backTranslating = false,
}: {
  result: EiwaResult;
  onLookup?: (word: string, lang: DictLang) => void;
  onBackTranslate?: () => void;
  backTranslation?: string | null;
  backTranslating?: boolean;
}) {
  const [resolved, setResolved] = useState<{ en: Set<string>; ja: Set<string> }>({
    en: new Set(),
    ja: new Set(),
  });
  useEffect(() => {
    let cancelled = false;
    setResolved({ en: new Set(), ja: new Set() });
    if (!onLookup) return;
    const terms = { en: new Set<string>(), ja: new Set<string>() };
    const add = (text: string, lang: DictLang) => {
      terms[lang].add(tokenKey(text, lang));
      for (const token of lookupTokens(text, lang))
        if (isLookupToken(token, lang)) terms[lang].add(tokenKey(token, lang));
    };
    for (const entry of result.dictionary) {
      add(entry.headword, entry.lang);
      for (const t of entry.translations) add(t.text, t.lang);
      for (const s of entry.senses) {
        add(s.gloss, "en");
        for (const example of s.examples ?? []) add(example, entry.lang);
      }
      for (const pair of entry.examples ?? [])
        for (const lang of ["en", "ja"] as const) add(pair[lang].text, lang);
    }
    void Promise.all([
      resolveHeadwords([...terms.en], "en").catch(() => new Set<string>()),
      resolveHeadwords([...terms.ja], "ja").catch(() => new Set<string>()),
    ]).then(([en, ja]) => {
      if (!cancelled) setResolved({ en, ja });
    });
    return () => {
      cancelled = true;
    };
  }, [result, onLookup]);
  const text = (value: string, lang: DictLang, known = false) => {
    if (!onLookup) return value;
    const button = (word: string, key: number) => (
      <button
        key={key}
        type="button"
        class="relookup"
        title={`Look up ${word}`}
        aria-label={`Look up ${word}`}
        onClick={() => onLookup(word, lang)}
      >
        {word}
      </button>
    );
    if (known || resolved[lang].has(tokenKey(value, lang))) return button(value, 0);
    let count = 0;
    return lookupTokens(value, lang).map((token, i) => {
      if (count < 4 && isLookupToken(token, lang) && resolved[lang].has(tokenKey(token, lang))) {
        count++;
        return button(token, i);
      }
      return token;
    });
  };
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
            <ProvenanceTag hasDictionary={hasDict} hasAi={!hasDict && hasAi} />
          </header>
          {(result.dictionary[0]?.match?.kind === "prefix" ||
            result.dictionary[0]?.match?.kind === "partial") && (
            <p>
              {result.dictionary[0].match.kind === "prefix" ? "Prefix" : "Partial"} match:{" "}
              {result.input} → {result.dictionary[0].headword}
            </p>
          )}
          <p class="translation-primary">
            <span lang={targetLang}>{text(result.translation.primary, targetLang)}</span>
            <CopyButton text={result.translation.primary} />
            <SpeakButton text={result.translation.primary} lang={targetLang} />
          </p>
          {result.translation.alternatives.length > 0 && (
            <p class="translation-alternatives">
              Also: <span lang={targetLang}>{result.translation.alternatives.join(", ")}</span>
            </p>
          )}
        </section>
      )}

      {hasDict && result.aiTranslation && (
        <section class="card" aria-labelledby="ai-translation-heading">
          <header class="card-header">
            <h2 id="ai-translation-heading">AI translation</h2>
            <ProvenanceTag hasDictionary={false} hasAi />
          </header>
          <p class="translation-primary">
            <span lang={targetLang}>{result.aiTranslation.primary}</span>
            <CopyButton text={result.aiTranslation.primary} />
            <SpeakButton text={result.aiTranslation.primary} lang={targetLang} />
          </p>
          {result.aiTranslation.alternatives.length > 0 && (
            <p class="translation-alternatives">
              Also: <span lang={targetLang}>{result.aiTranslation.alternatives.join(", ")}</span>
            </p>
          )}
        </section>
      )}

      {result.aiTranslation?.primary && (onBackTranslate || backTranslating || backTranslation) && (
        <section class="card" aria-label="AI back-translation check">
          {(onBackTranslate || backTranslating) && (
            <button
              type="button"
              class="btn btn-secondary"
              disabled={!onBackTranslate || backTranslating}
              onClick={onBackTranslate}
            >
              {backTranslating ? "Checking…" : "Back-translate AI translation"}
            </button>
          )}
          {backTranslation && (
            <div aria-live="polite">
              <h2>AI back-translation</h2>
              <ProvenanceTag hasDictionary={false} hasAi />
              <p lang={sourceLang}>{backTranslation}</p>
              <p class="settings-note">
                AI output for nuance verification, not dictionary data or a guarantee of accuracy.
              </p>
            </div>
          )}
        </section>
      )}

      {hasDict && (
        <section class="card" aria-labelledby="dictionary-heading">
          <header class="card-header">
            <h2 id="dictionary-heading">Dictionary</h2>
            <ProvenanceTag hasDictionary hasAi={false} />
          </header>
          {onLookup && (
            <p class="settings-note">
              Underlined terms: tap to look up. Only dictionary-resolved terms are marked (up to
              four per text).
            </p>
          )}
          <ul class="dictionary-entries">
            {result.dictionary.map((entry) => (
              <li key={entry.id} class="dictionary-entry">
                <div class="dictionary-entry-head">
                  <strong lang={entry.lang}>{text(entry.headword, entry.lang, true)}</strong>
                  {entry.level && (
                    <span class="pos-tags" title="Eiwa coarse NGSL band (not CEFR/SVL)">
                      {entry.level} · NGSL
                    </span>
                  )}
                  {entry.match && (
                    <span class="pos-tags">
                      {entry.match.kind === "inflection"
                        ? `Inflected form: ${entry.match.query} → ${entry.headword}`
                        : `${entry.match.kind === "prefix" ? "Prefix" : "Partial"} match`}
                    </span>
                  )}
                  {entry.reading && (
                    <span class="reading" lang={entry.lang}>
                      （{entry.reading}）
                    </span>
                  )}
                  {entry.pos.length > 0 && <span class="pos-tags">{entry.pos.join(", ")}</span>}
                </div>
                <p class="translations">
                  {entry.translations.map((t) => (
                    <span key={t.text} lang={t.lang}>
                      {text(t.text, t.lang)}
                    </span>
                  ))}
                </p>
                <ol class="senses">
                  {entry.senses.map((sense) => (
                    <li key={sense.gloss} lang="en">
                      {text(sense.gloss, "en")}
                      {sense.tags && sense.tags.length > 0 ? ` (${sense.tags.join(", ")})` : ""}
                    </li>
                  ))}
                </ol>
                {entry.source
                  .filter((source) => source.name.includes("Wiktionary") && source.url)
                  .map((source) => (
                    <p key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        Wiktionary headword data / contributors
                      </a>{" "}
                      (trimmed, not sense-aligned)
                    </p>
                  ))}
                {entry.relatedWords?.length ? (
                  <p>Related terms: {entry.relatedWords.join(", ")}</p>
                ) : null}
                {entry.inflectionForms?.length ? (
                  <p>Inflection forms: {entry.inflectionForms.join(", ")}</p>
                ) : null}
                {entry.examples?.length ? (
                  <details class="entry-examples" open={entry.id === result.dictionary[0]?.id}>
                    <summary>
                      Examples — dictionary data (headword-level, not sense-aligned)
                    </summary>
                    <ul>
                      {entry.examples.slice(0, 3).map((pair) => (
                        <li key={`${pair.en.id}:${pair.ja.id}`}>
                          <p lang="en">{text(pair.en.text, "en")}</p>
                          <p lang="ja">{text(pair.ja.text, "ja")}</p>
                          <small>
                            Tatoeba — CC BY 2.0 FR.{" "}
                            {(["en", "ja"] as const).map((lang) => (
                              <span key={lang}>
                                <a
                                  href={`https://tatoeba.org/en/sentences/show/${pair[lang].id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  #{pair[lang].id}
                                </a>
                                {" by "}
                                <a
                                  href={`https://tatoeba.org/en/user/profile/${encodeURIComponent(pair[lang].author)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {pair[lang].author}
                                </a>{" "}
                              </span>
                            ))}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
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
          <ul lang="ja">
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
              <span lang={sourceLang}>{result.correction.corrected}</span>
              <CopyButton text={result.correction.corrected} />
            </p>
          )}
          {result.correction.explanation !== null && (
            <p class="correction-explanation" lang="ja">
              {result.correction.explanation}
            </p>
          )}
        </section>
      )}

      {result.etymology !== null && (
        <section class="card" aria-labelledby="etymology-heading">
          <header class="card-header">
            <h2 id="etymology-heading">Etymology</h2>
            <ProvenanceTag hasDictionary={true} hasAi={false} />
          </header>
          <p class="collapsible-text" lang="en">
            {result.etymology}
          </p>
        </section>
      )}

      {result.pronunciation !== null && (
        <section class="card" aria-labelledby="pronunciation-heading">
          <header class="card-header">
            <h2 id="pronunciation-heading">Pronunciation</h2>
            <ProvenanceTag hasDictionary={true} hasAi={false} />
          </header>
          <p class="pronunciation">
            {result.pronunciation.ipa && <span class="ipa">{result.pronunciation.ipa}</span>}
            {result.pronunciation.kana && (
              <span class="kana" lang="ja">
                {result.pronunciation.kana}
              </span>
            )}
            <SpeakButton text={result.pronunciation.audioText ?? result.input} lang={sourceLang} />
          </p>
          {result.pronunciation.recording && (
            <RecordingPlayer
              key={result.pronunciation.recording.url}
              recording={result.pronunciation.recording}
            />
          )}
        </section>
      )}

      {result.derivedWords.length > 0 && (
        <section class="card" aria-labelledby="derived-heading">
          <header class="card-header">
            <h2 id="derived-heading">Derived words</h2>
            <ProvenanceTag hasDictionary={true} hasAi={false} />
          </header>
          <p lang={sourceLang}>{result.derivedWords.join(", ")}</p>
        </section>
      )}

      {examples.length > 0 && (
        <section class="card" aria-labelledby="examples-heading">
          <header class="card-header">
            <h2 id="examples-heading">Examples</h2>
            <ProvenanceTag hasDictionary={true} hasAi={false} />
          </header>
          <ul lang={sourceLang}>
            {examples.map((example) => (
              <li key={example}>{text(example, sourceLang)}</li>
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
                {source.name} —{" "}
                {source.licenseUrl ? (
                  <a href={source.licenseUrl} target="_blank" rel="noreferrer">
                    {source.license}
                  </a>
                ) : (
                  source.license
                )}
                {source.url && (
                  <>
                    {" "}
                    ·{" "}
                    <a href={source.url} target="_blank" rel="noreferrer">
                      Source / contributors
                    </a>
                  </>
                )}
                {source.attribution && <p>{source.attribution}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
