import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type DirectionChoice, InputBar } from "./components/InputBar";
import { LearningSheet } from "./components/LearningSheet";
import { ResultView } from "./components/ResultView";
import { SettingsSheet } from "./components/SettingsSheet";
import { SourcesModal } from "./components/SourcesModal";
import { type BannerState, StatusBanner } from "./components/StatusBanner";
import {
  dictionaryLicenses,
  dictionaryManifestInfo,
  resetDictionaryCaches,
  suggestSpellings,
} from "./dict";
import { clearDictionaryCache } from "./dict-cache";
import type { DictionarySource, DictLang } from "./dict-types";
import { lookupError } from "./errors";
import { type Direction, sourceLangFor } from "./language";
import {
  addHistory,
  HISTORY_ENABLED_KEY,
  HISTORY_KEY,
  type HistoryItem,
  historyEnabled,
  loadHistory,
  loadWordbook,
  mergeWordbook,
  reopen,
  type SavedWord,
  saveWordbook,
  snapshot,
  wordId,
} from "./learning";
import {
  type AiEngine,
  type AiStatus,
  clearAllModelCaches,
  createLocalAiEngine,
  type ModelLoadProgress,
  probeWebGpuAdapter,
} from "./llm";
import { lookup } from "./lookup";
import { MODEL_OPTIONS } from "./model-config";
import type { EiwaResult } from "./result-schema";
import { loadSettings, saveSettings } from "./settings";

export function App() {
  const [initialSettings] = useState(() => loadSettings());
  const [learningOpen, setLearningOpen] = useState(false);
  const [wordbookLoad] = useState(() => {
    try {
      return { words: loadWordbook(), failed: false };
    } catch {
      return { words: [] as SavedWord[], failed: true };
    }
  });
  const [words, setWords] = useState(wordbookLoad.words);
  const [historyOn, setHistoryOn] = useState(historyEnabled);
  const historyOnRef = useRef(historyOn);
  const [history, setHistory] = useState(loadHistory);
  const [savedView, setSavedView] = useState(false);

  const [input, setInput] = useState("");
  const [directionChoice, setDirectionChoice] = useState<DirectionChoice>(
    initialSettings.directionChoice,
  );
  const [result, setResult] = useState<EiwaResult | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [spelling, setSpelling] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    setSpelling([]);
    if (!result || result.dictionary.length) return;
    void suggestSpellings(result.input, sourceLangFor(result.direction))
      .then((words) => {
        if (!cancelled) setSpelling(words);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [result]);

  // A persisted "enabled" is only meaningful when paired with a known-cached
  // model: without that, no engine gets (re)created on startup (see the
  // `modelCached` gate below), so treating it as enabled here would leave
  // the checkbox checked and the model controls visible while AI lookups
  // silently no-op — and would force the user to uncheck before they could
  // re-check to actually retry.
  const [aiEnabled, setAiEnabled] = useState(
    initialSettings.aiEnabled && initialSettings.modelCached,
  );
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiProgress, setAiProgress] = useState<ModelLoadProgress | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(initialSettings.modelId);
  const [modelCached, setModelCached] = useState(initialSettings.modelCached);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [licenses, setLicenses] = useState<DictionarySource[]>([]);
  const [dictInfo, setDictInfo] = useState<{ builtAt: string; shardCount: number } | null>(null);

  const engineRef = useRef<AiEngine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeLookupRef = useRef<Promise<void> | null>(null);
  const requestIdRef = useRef(0);
  // null while the async adapter probe is in flight (typically milliseconds);
  // treated as "not yet supported" everywhere until it resolves.
  const [webGpuSupported, setWebGpuSupported] = useState<boolean | null>(null);

  /** Cancels any in-flight lookup and waits for it to fully unwind, so the
   * AI engine's status has settled before the caller disposes it or starts
   * a new lookup that checks that status. */
  const cancelActiveLookup = useCallback(async () => {
    abortRef.current?.abort();
    await activeLookupRef.current?.catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void dictionaryManifestInfo()
      .then((info) => {
        if (!cancelled) setDictInfo({ builtAt: info.builtAt, shardCount: info.shardCount });
      })
      .catch(() => undefined);
    void dictionaryLicenses()
      .then((list) => {
        if (!cancelled) setLicenses(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      engineRef.current?.dispose();
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void probeWebGpuAdapter().then((supported) => {
      if (cancelled) return;
      setWebGpuSupported(supported);
      // A persisted "enabled" from a previous device/browser is meaningless
      // once we know this one has no usable WebGPU adapter — clear it so the
      // Settings checkbox and the AI-only controls it gates don't get stuck
      // showing "on" while permanently disabled.
      if (!supported) setAiEnabled(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveSettings({ aiEnabled, modelId: selectedModelId, directionChoice, modelCached });
  }, [aiEnabled, selectedModelId, directionChoice, modelCached]);

  // Re-creates the engine on startup when AI was left enabled in a previous
  // session and that model's weights are known to already be fully cached
  // (`modelCached`), so the user doesn't have to re-open Settings and
  // re-toggle just because the tab reloaded. Gated on `modelCached` — not
  // just `aiEnabled` — so a previously failed/incomplete download isn't
  // silently retried on every reload; it only resumes once the user
  // explicitly re-enables it. Guarded by `engineRef.current` so it never
  // fights with a manual toggle (handleToggleAi/handleSelectModel) that
  // already created one.
  useEffect(() => {
    if (webGpuSupported !== true || !aiEnabled || !modelCached || engineRef.current) return;
    const engine = createLocalAiEngine(selectedModelId);
    engineRef.current = engine;
    void engine
      .ensureReady(setAiStatus, setAiProgress)
      .then(() => setModelCached(true))
      .catch(() => {
        setModelCached(false);
        setBanner({ kind: "error", message: lookupError("model-load-failed").message });
      });
  }, [webGpuSupported, aiEnabled, modelCached, selectedModelId]);

  const handleSubmit = useCallback(
    async (candidate?: string, direction?: Direction) => {
      const query = candidate ?? input;
      if (query.trim() === "") return;
      if (candidate) setInput(candidate);

      // Cancel and fully await any previous lookup first, so a stale AI
      // generation can't leave the engine's status as "generating" (or the
      // shared `busy` flag reset to false) by the time this lookup checks it.
      await cancelActiveLookup();

      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      const isCurrent = () => requestIdRef.current === requestId;

      const run = (async () => {
        setBusy(true);
        setSavedView(false);
        setBanner(null);
        setResult(null);

        try {
          for await (const event of lookup(query, {
            signal: controller.signal,
            aiEngine: aiEnabled ? engineRef.current : null,
            direction: direction ?? (directionChoice === "auto" ? undefined : directionChoice),
          })) {
            if (!isCurrent()) return;
            switch (event.type) {
              case "ai-status":
                setAiStatus(event.status);
                break;
              case "error":
                setBanner({ kind: "error", message: event.error.message });
                break;
              case "result":
                setResult(event.result);
                if (historyOnRef.current) {
                  setHistory((current) => {
                    const next = addHistory(current, {
                      input: event.result.input,
                      direction: event.result.direction,
                    });
                    try {
                      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
                    } catch {
                      setBanner({
                        kind: "error",
                        message: "History could not be saved on this device.",
                      });
                    }
                    return next;
                  });
                }
                // Avoid showing the same failure text in both the banner and
                // the result's own Warnings card.
                setBanner((current) =>
                  current && event.result.warnings.includes(current.message) ? null : current,
                );
                break;
              case "cancelled":
                setBanner({ kind: "info", message: "Cancelled." });
                break;
              default:
                break;
            }
          }
        } finally {
          if (isCurrent()) setBusy(false);
        }
      })();

      activeLookupRef.current = run;
      await run;
    },
    [input, aiEnabled, directionChoice, cancelActiveLookup],
  );

  const handleRelookup = useCallback(
    (word: string, lang: DictLang) => {
      void handleSubmit(word, lang === "en" ? "en-ja" : "ja-en");
    },
    [handleSubmit],
  );

  const updateWords = (next: SavedWord[]): boolean => {
    try {
      if (wordbookLoad.failed)
        throw new Error("Existing wordbook could not be read; refusing to overwrite it.");
      saveWordbook(next);
      setWords(next);
      return true;
    } catch {
      setBanner({
        kind: "error",
        message:
          "Wordbook could not be saved. Storage may be unavailable, full or contain invalid data. Existing data was not overwritten.",
      });
      return false;
    }
  };
  const updateHistory = (items: HistoryItem[]) => {
    try {
      if (items.length) localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
      else localStorage.removeItem(HISTORY_KEY);
      setHistory(items);
    } catch {
      setBanner({ kind: "error", message: "History could not be changed on this device." });
    }
  };

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleClear = useCallback(() => {
    abortRef.current?.abort();
    setInput("");
    setResult(null);
    setBanner(null);
  }, []);

  const handleToggleAi = useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        setAiEnabled(false);
        return;
      }
      if (!webGpuSupported) {
        setBanner({ kind: "error", message: lookupError("webgpu-unavailable").message });
        return;
      }

      setAiEnabled(true);
      if (!engineRef.current) {
        engineRef.current = createLocalAiEngine(selectedModelId);
      }
      try {
        await engineRef.current.ensureReady(setAiStatus, setAiProgress);
        setModelCached(true);
      } catch {
        setModelCached(false);
        setBanner({ kind: "error", message: lookupError("model-load-failed").message });
      }
    },
    [selectedModelId, webGpuSupported],
  );

  const handleSelectModel = useCallback(
    async (modelId: string) => {
      // A lookup mid-generation on the old engine must be cancelled (and
      // settled) before that engine is disposed, or its pending explain()
      // call would otherwise hang forever waiting on a terminated Worker.
      await cancelActiveLookup();

      engineRef.current?.dispose();
      engineRef.current = null;
      setAiStatus("idle");
      setAiProgress(null);
      setSelectedModelId(modelId);
      setModelCached(false);

      if (aiEnabled) {
        const engine = createLocalAiEngine(modelId);
        engineRef.current = engine;
        await engine
          .ensureReady(setAiStatus, setAiProgress)
          .then(() => setModelCached(true))
          .catch(() => {
            setBanner({ kind: "error", message: lookupError("model-load-failed").message });
          });
      }
    },
    [aiEnabled, cancelActiveLookup],
  );

  const handleClearCache = useCallback(async () => {
    await cancelActiveLookup();
    await clearDictionaryCache();
    resetDictionaryCaches();
    await clearAllModelCaches().catch(() => undefined);
    engineRef.current?.dispose();
    engineRef.current = null;
    // The model's cached weights were just deleted, so AI can no longer be
    // silently "on" with no engine behind it; require the user to
    // re-enable it (and accept the re-download) explicitly.
    setAiEnabled(false);
    setModelCached(false);
    setAiStatus("idle");
    setAiProgress(null);
    setBanner({ kind: "info", message: "Local cache cleared." });
  }, [cancelActiveLookup]);

  return (
    <div class="shell">
      <header class="app-header">
        <h1>Eiwa</h1>
        <button type="button" class="btn btn-ghost" onClick={() => setLearningOpen(true)}>
          Wordbook &amp; history
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label="Open settings"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙️
        </button>
      </header>

      <main class="app-main">
        <InputBar
          value={input}
          onChange={setInput}
          direction={directionChoice}
          onDirectionChange={setDirectionChoice}
          onSubmit={(candidate) => void handleSubmit(candidate)}
          onClear={handleClear}
          onCancel={handleCancel}
          busy={busy}
        />

        <StatusBanner banner={banner} />

        {busy && !result && <p class="loading-hint">Looking up…</p>}

        {spelling.length > 0 && (
          <section class="card" aria-label="Spelling suggestions">
            <h2>Did you mean…</h2>
            {spelling.map((word) => (
              <button
                type="button"
                key={word}
                class="btn btn-ghost"
                onClick={() => void handleSubmit(word)}
              >
                {word}
              </button>
            ))}
          </section>
        )}
        {wordbookLoad.failed && (
          <p role="alert">
            Saved wordbook could not be read. It has not been overwritten. Check browser storage or
            restore from a backup.
          </p>
        )}
        {result && (
          <>
            <div class="wordbook-save">
              {savedView && <p>Saved dictionary snapshot — content from save time.</p>}
              <button
                type="button"
                class="btn btn-secondary"
                disabled={!result.dictionary.length || words.some((w) => w.id === wordId(result))}
                onClick={() => {
                  try {
                    if (updateWords(mergeWordbook(words, [snapshot(result)])))
                      setBanner({
                        kind: "info",
                        message: "Saved dictionary snapshot to wordbook.",
                      });
                  } catch {
                    setBanner({
                      kind: "error",
                      message:
                        "Wordbook is full (200 entries). Export or delete some entries first.",
                    });
                  }
                }}
              >
                {words.some((w) => w.id === wordId(result))
                  ? "Saved in wordbook"
                  : "Save to wordbook"}
              </button>
            </div>
            <ResultView result={result} onLookup={handleRelookup} />
          </>
        )}
      </main>

      {learningOpen && (
        <LearningSheet
          words={words}
          onWords={updateWords}
          history={history}
          historyOn={historyOn}
          onHistory={updateHistory}
          onHistoryToggle={(enabled) => {
            try {
              // Erase before disabling; never leave hidden retained queries.
              if (!enabled) localStorage.removeItem(HISTORY_KEY);
              localStorage.setItem(HISTORY_ENABLED_KEY, String(enabled));
              historyOnRef.current = enabled;
              setHistoryOn(enabled);
              if (!enabled) setHistory([]);
            } catch {
              setBanner({ kind: "error", message: "History preference could not be saved." });
            }
          }}
          onReopen={(word) => {
            // Invalidate active requests synchronously before showing a snapshot.
            abortRef.current?.abort();
            requestIdRef.current++;
            setBusy(false);
            setInput(word.input);
            setResult(reopen(word));
            setSavedView(true);
            setBanner(null);
            setLearningOpen(false);
          }}
          onLookup={(item) => {
            setLearningOpen(false);
            void handleSubmit(item.input, item.direction);
          }}
          onClose={() => setLearningOpen(false)}
        />
      )}

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        aiEnabled={aiEnabled}
        onToggleAi={(enabled) => void handleToggleAi(enabled)}
        aiStatus={aiStatus}
        aiProgress={aiProgress}
        webGpuSupported={webGpuSupported}
        modelOptions={MODEL_OPTIONS}
        selectedModelId={selectedModelId}
        onSelectModel={handleSelectModel}
        dictInfo={dictInfo}
        onClearCache={() => void handleClearCache()}
        onOpenSources={() => {
          setSettingsOpen(false);
          setSourcesOpen(true);
        }}
      />

      <SourcesModal open={sourcesOpen} onClose={() => setSourcesOpen(false)} licenses={licenses} />
    </div>
  );
}
