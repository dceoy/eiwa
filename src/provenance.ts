export type SectionProvenance = "dictionary" | "ai" | "dictionary+ai";

export const PROVENANCE_LABELS: Record<SectionProvenance, string> = {
  dictionary: "Dictionary",
  ai: "AI explanation",
  "dictionary+ai": "Dictionary + AI",
};

export function provenanceFor(hasDictionary: boolean, hasAi: boolean): SectionProvenance | null {
  if (hasDictionary && hasAi) return "dictionary+ai";
  if (hasDictionary) return "dictionary";
  if (hasAi) return "ai";
  return null;
}
