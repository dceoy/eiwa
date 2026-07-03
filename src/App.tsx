import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type DirectionChoice, InputBar } from "./components/InputBar";
import { ResultView } from "./components/ResultView";
import { SettingsSheet } from "./components/SettingsSheet";
import { SourcesModal } from "./components/SourcesModal";
import { type BannerState, StatusBanner } from "./components/StatusBanner";
import { dictionaryLicenses, dictionaryManifestInfo } from "./dict";
import { clearDictionaryCache } from "./dict-cache";
import type { DictionarySource } from "./dict-types";
import { lookupError } from "./errors";
import {
  type AiEngine,
  type AiStatus,
  clearModelCache,
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
  const webGpuSupported = isWebGpuSupported();

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

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBusy(true);
    setBanner(null);
    setResult(null);

    try {
      for await (const event of lookup(input, {
        signal: controller.signal,
        aiEngine: aiEnabled ? engineRef.current : null,
        direction: directionChoice === "auto" ? undefined : directionChoice,
      })) {
        switch (event.type) {
          case "ai-status":
            setAiStatus(event.status);
            break;
          case "error":
            setBanner({ kind: "error", message: event.error.message });
            break;
          case "result":
            setResult(event.result);
            break;
          case "cancelled":
            setBanner({ kind: "info", message: "Cancelled." });
            break;
          default:
            break;
        }
      }
    } finally {
      setBusy(false);
    }
  }, [input, aiEnabled, directionChoice]);

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
    (modelId: string) => {
      engineRef.current?.dispose();
      engineRef.current = null;
      setAiStatus("idle");
      setAiProgress(null);
      setSelectedModelId(modelId);

      if (aiEnabled) {
        const engine = createLocalAiEngine(modelId);
        engineRef.current = engine;
        void engine.ensureReady(setAiStatus, setAiProgress).catch(() => {
          setBanner({ kind: "error", message: lookupError("model-load-failed").message });
        });
      }
    },
    [aiEnabled],
  );

  const handleClearCache = useCallback(async () => {
    await clearDictionaryCache();
    await clearModelCache(selectedModelId).catch(() => undefined);
    engineRef.current?.dispose();
    engineRef.current = null;
    setAiStatus("idle");
    setAiProgress(null);
    setBanner({ kind: "info", message: "Local cache cleared." });
  }, [selectedModelId]);

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
