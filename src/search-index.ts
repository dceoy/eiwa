import type { HeadwordRow, InflectionRow, SearchIndexRef } from "./dict-types";

export const SEARCH_FILE_BYTES = 256 * 1024;
export const SUGGESTION_LIMIT = 8;
export const RESULT_LIMIT = 30;
export const MAX_SEARCH_LENGTH = 64;

export function validateSearchRows(
  value: unknown,
  kind: SearchIndexRef["kind"],
): value is HeadwordRow[] | InflectionRow[] {
  if (!Array.isArray(value) || !value.length) return false;
  let previous = "";
  return value.every((row) => {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      typeof row[0] !== "string" ||
      !row[0] ||
      row[0] <= previous
    )
      return false;
    previous = row[0];
    return kind === "headwords"
      ? typeof row[1] === "number" && Number.isFinite(row[1]) && row[1] >= 0
      : Array.isArray(row[1]) &&
          row[1].length > 0 &&
          row[1].every((lemma) => typeof lemma === "string" && lemma.length > 0) &&
          new Set(row[1]).size === row[1].length;
  });
}

/** Bounded Levenshtein distance, Unicode code points, with early row exit. */
export function editDistance(a: string, b: string, limit: number): number {
  const x = Array.from(a);
  const y = Array.from(b);
  if (Math.abs(x.length - y.length) > limit) return limit + 1;
  let row = y.map((_, i) => i + 1);
  row.unshift(0);
  for (let i = 1; i <= x.length; i++) {
    const next = [i];
    for (let j = 1; j <= y.length; j++) {
      next[j] = Math.min(
        (next[j - 1] ?? 0) + 1,
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
    if (Math.min(...next) > limit) return limit + 1;
    row = next;
  }
  return row[y.length] ?? 0;
}

/** Code-unit order is shared by build-time ranges and runtime routing. */
export function lexical(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function rankHeadwords(a: HeadwordRow, b: HeadwordRow): number {
  return b[1] - a[1] || a[0].length - b[0].length || lexical(a[0], b[0]);
}
