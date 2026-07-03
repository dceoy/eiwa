export type LookupErrorCode =
  | "empty-input"
  | "unsupported-language"
  | "dictionary-miss"
  | "webgpu-unavailable"
  | "model-load-failed"
  | "generation-cancelled"
  | "generation-invalid-json"
  | "network-unavailable-for-dictionary-shard";

export interface LookupError {
  code: LookupErrorCode;
  message: string;
}

const DEFAULT_MESSAGES: Record<LookupErrorCode, string> = {
  "empty-input": "Enter a word, phrase, or sentence to look up.",
  "unsupported-language": "Eiwa currently supports English and Japanese input only.",
  "dictionary-miss": "No dictionary entry was found for this input.",
  "webgpu-unavailable":
    "This browser/device does not support WebGPU, so AI explanations are unavailable. Dictionary results are still shown.",
  "model-load-failed": "The local AI model failed to load. Dictionary results are still shown.",
  "generation-cancelled": "Generation was cancelled.",
  "generation-invalid-json":
    "The AI response could not be parsed. Dictionary results are still shown.",
  "network-unavailable-for-dictionary-shard":
    "Could not download dictionary data. Check your connection and try again.",
};

export function lookupError(code: LookupErrorCode, message?: string): LookupError {
  return { code, message: message ?? DEFAULT_MESSAGES[code] };
}
