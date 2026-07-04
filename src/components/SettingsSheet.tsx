import type { AiStatus, ModelLoadProgress } from "../llm";
import type { ModelOption } from "../model-config";
import { ModalOverlay } from "./ModalOverlay";

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  onToggleAi: (enabled: boolean) => void;
  aiStatus: AiStatus;
  aiProgress: ModelLoadProgress | null;
  webGpuSupported: boolean;
  modelOptions: ModelOption[];
  selectedModelId: string;
  onSelectModel: (id: string) => void;
  dictInfo: { builtAt: string; shardCount: number } | null;
  onClearCache: () => void;
  onOpenSources: () => void;
}

export function SettingsSheet({
  open,
  onClose,
  aiEnabled,
  onToggleAi,
  aiStatus,
  aiProgress,
  webGpuSupported,
  modelOptions,
  selectedModelId,
  onSelectModel,
  dictInfo,
  onClearCache,
  onOpenSources,
}: SettingsSheetProps) {
  if (!open) return null;

  return (
    <ModalOverlay onClose={onClose} labelledBy="settings-heading">
      <header class="sheet-header">
        <h2 id="settings-heading">Settings</h2>
        <button type="button" class="icon-btn" aria-label="Close settings" onClick={onClose}>
          ✕
        </button>
      </header>

      <section class="settings-section">
        <h3>AI explanations</h3>
        <p class="settings-note">
          Translation, nuance, and writing correction run entirely in your browser via WebLLM.
          Nothing you type is sent to a server. The model downloads on first use.
        </p>
        {!webGpuSupported && (
          <p class="settings-warning">
            This browser/device does not support WebGPU, so AI explanations are unavailable.
            Dictionary lookup still works.
          </p>
        )}
        <label class="toggle-row">
          <span>Enable AI explanations</span>
          <input
            type="checkbox"
            checked={aiEnabled}
            disabled={!webGpuSupported}
            onChange={(event) => onToggleAi(event.currentTarget.checked)}
          />
        </label>

        {aiEnabled && (
          <>
            <fieldset class="model-choice">
              <legend>Model</legend>
              {modelOptions.map((option) => (
                <label key={option.id} class="model-option">
                  <input
                    type="radio"
                    name="model"
                    value={option.id}
                    checked={selectedModelId === option.id}
                    onChange={() => onSelectModel(option.id)}
                  />
                  <span>
                    <strong>{option.label}</strong> — ~{option.approxDownloadSizeMb} MB,{" "}
                    {option.description}
                  </span>
                </label>
              ))}
            </fieldset>

            <p class="settings-note" aria-live="polite">
              Status: {aiStatus}
              {aiStatus === "loading-model" && aiProgress
                ? ` — ${Math.round(aiProgress.progress * 100)}% (${aiProgress.text})`
                : ""}
            </p>
          </>
        )}
      </section>

      <section class="settings-section">
        <h3>Dictionary data</h3>
        {dictInfo ? (
          <p class="settings-note">
            Built {new Date(dictInfo.builtAt).toLocaleDateString()} · {dictInfo.shardCount} shards
            cached on demand.
          </p>
        ) : (
          <p class="settings-note">Not loaded yet.</p>
        )}
      </section>

      <section class="settings-section settings-actions">
        <button type="button" class="btn btn-secondary" onClick={onClearCache}>
          Clear local cache
        </button>
        <button type="button" class="btn btn-ghost" onClick={onOpenSources}>
          Sources &amp; licenses
        </button>
      </section>
    </ModalOverlay>
  );
}
