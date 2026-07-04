export interface ModelOption {
  id: string;
  label: string;
  /** Rough download size; actual size depends on quantization/caching and may vary. */
  approxDownloadSizeMb: number;
  recommendedDeviceClass: "mobile" | "desktop";
  description: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Lite",
    approxDownloadSizeMb: 400,
    recommendedDeviceClass: "mobile",
    description: "Smallest download, fastest to start. Recommended for phones.",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Balanced",
    approxDownloadSizeMb: 1024,
    recommendedDeviceClass: "desktop",
    description:
      "Larger download with more capable explanations. Recommended for laptops/desktops.",
  },
];

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0]?.id ?? "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

export function findModelOption(id: string): ModelOption | undefined {
  return MODEL_OPTIONS.find((option) => option.id === id);
}
