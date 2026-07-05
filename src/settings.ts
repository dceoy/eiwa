import type { DirectionChoice } from "./components/InputBar";
import { DEFAULT_MODEL_ID, findModelOption } from "./model-config";

export interface EiwaSettings {
  aiEnabled: boolean;
  modelId: string;
  directionChoice: DirectionChoice;
}

/** Bump if the persisted shape ever changes incompatibly. */
const STORAGE_KEY = "eiwa:settings:v1";

const DEFAULT_SETTINGS: EiwaSettings = {
  aiEnabled: false,
  modelId: DEFAULT_MODEL_ID,
  directionChoice: "auto",
};

function isDirectionChoice(value: unknown): value is DirectionChoice {
  return value === "auto" || value === "en-ja" || value === "ja-en";
}

/**
 * Reads persisted settings, falling back field-by-field to defaults for
 * anything missing, malformed, or (for `modelId`) no longer a valid option
 * — e.g. a model removed from `MODEL_OPTIONS` in a later release. Never
 * throws: a corrupt or inaccessible `localStorage` (private browsing,
 * quota, disabled storage) just yields the defaults.
 */
export function loadSettings(): EiwaSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<EiwaSettings> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_SETTINGS;

    return {
      aiEnabled:
        typeof parsed.aiEnabled === "boolean" ? parsed.aiEnabled : DEFAULT_SETTINGS.aiEnabled,
      modelId:
        typeof parsed.modelId === "string" && findModelOption(parsed.modelId)
          ? parsed.modelId
          : DEFAULT_SETTINGS.modelId,
      directionChoice: isDirectionChoice(parsed.directionChoice)
        ? parsed.directionChoice
        : DEFAULT_SETTINGS.directionChoice,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: EiwaSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable or full: settings simply won't persist this time.
  }
}
