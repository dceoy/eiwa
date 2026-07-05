import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type DirectionChoice, InputBar } from "./components/InputBar";
import { ResultView } from "./components/ResultView";
import { SettingsSheet } from "./components/SettingsSheet";
import { SourcesModal } from "./components/SourcesModal";
import { type BannerState, StatusBanner } from "./components/StatusBanner";
import { dictionaryLicenses, dictionaryManifestInfo, resetDictionaryCaches } from "./dict";
import { clearDictionaryCache } from "./dict-cache";
import type { DictionarySource } from "./dict-types";
import { lookupError } from "./errors";
import {
  type AiEngine,
  type AiStatus,
  clearAllModelCaches,
  createLocalAiEngine,
  isWebGpuSupported,
  type ModelLoadProgress,
} from "./llm";
import { lookup } from "./lookup";
import { DEFAULT_MODEL_ID, MODEL_OPTIONS } from "./model-config";
import type { EiwaResult } from "./result-schema";

export function App() {
  const [input, setInput] = useState("");
  const [directionChoice, setDirectionChoice] = useState<DirectionChoice>("auto");
  const [result, setResult] = useState<EiwaResult | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busy, setBusy] = useState(false);

  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiProgress, setAiProgress] = useState<ModelLoadProgress | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_MODEL_ID);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [licenses, setLicenses] = useState<DictionarySource[]>([]);
  const [dictInfo, setDictInfo] = useState<{ builtAt: string; shardCount: number } | null>(null);

  const engineRef = useRef<AiEngine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeLookupRef = useRef<Promise<void> | null>(null);
  const requestIdRef = useRef(0);
  const webGpuSupported = isWebGpuSupported();

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

  const handleSubmit = useCallback(async () => {
    if (input.trim() === "") return;

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
      setBanner(null);
      setResult(null);

      try {
        for await (const event of lookup(input, {
          signal: controller.signal,
          aiEngine: aiEnabled ? engineRef.current : null,
          direction: directionChoice === "auto" ? undefined : directionChoice,
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
  }, [input, aiEnabled, directionChoice, cancelActiveLookup]);

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
      } catch {
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

      if (aiEnabled) {
        const engine = createLocalAiEngine(modelId);
        engineRef.current = engine;
        await engine.ensureReady(setAiStatus, setAiProgress).catch(() => {
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
    setAiStatus("idle");
    setAiProgress(null);
    setBanner({ kind: "info", message: "Local cache cleared." });
  }, [cancelActiveLookup]);

  return (
    <div class="shell">
      <header class="app-header">
        <h1>Eiwa 英和</h1>
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
          onSubmit={() => void handleSubmit()}
          onClear={handleClear}
          onCancel={handleCancel}
          busy={busy}
        />

        <StatusBanner banner={banner} />

        {busy && !result && <p class="loading-hint">Looking up…</p>}

        {result && <ResultView result={result} />}
      </main>

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
