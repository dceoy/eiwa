export interface NormalizedInput {
  raw: string;
  text: string;
  isEmpty: boolean;
  /** Multi-word/sentence input is eligible for writing correction. */
  isSentenceLike: boolean;
}

const WHITESPACE_RE = /\s+/g;
const WORD_BOUNDARY_RE = /[\s、。，,.!?！？]/;

export function normalizeInput(raw: string): NormalizedInput {
  const text = raw.normalize("NFKC").trim().replace(WHITESPACE_RE, " ");
  return {
    raw,
    text,
    isEmpty: text.length === 0,
    isSentenceLike: text.length > 1 && WORD_BOUNDARY_RE.test(text),
  };
}
