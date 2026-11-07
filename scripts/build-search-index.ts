import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeHeadword } from "../src/dict-normalize";
import type {
  DictionaryEntry,
  DictLang,
  HeadwordRow,
  InflectionRow,
  SearchIndexRef,
} from "../src/dict-types";
import { lexical, SEARCH_FILE_BYTES } from "../src/search-index";
import { inflections } from "./inflections";

export function searchRows(entries: DictionaryEntry[], lang: DictLang) {
  const words = new Map<string, number>();
  const forms = new Map<string, Set<string>>();
  for (const entry of entries) {
    const lemma = normalizeHeadword(entry.headword, lang);
    for (const raw of [
      entry.headword,
      ...(lang === "ja" && entry.reading ? [entry.reading] : []),
    ]) {
      const word = normalizeHeadword(raw, lang);
      if (word)
        words.set(
          word,
          Math.max(words.get(word) ?? 0, entry.headwordFrequency ?? entry.frequency ?? 0),
        );
    }
    for (const raw of [...inflections(entry), ...(entry.inflectionForms ?? [])]) {
      const form = normalizeHeadword(raw, lang);
      if (!form || form === lemma) continue;
      if (!forms.has(form)) forms.set(form, new Set());
      forms.get(form)?.add(lemma);
    }
  }
  return {
    headwords: [...words].sort((a, b) => lexical(a[0], b[0])) as HeadwordRow[],
    inflections: [...forms]
      .map(([form, lemmas]) => [form, [...lemmas].sort(lexical)] as InflectionRow)
      .sort((a, b) => lexical(a[0], b[0])),
  };
}

export function chunkRows(rows: (HeadwordRow | InflectionRow)[], budget = SEARCH_FILE_BYTES) {
  const chunks: (HeadwordRow | InflectionRow)[][] = [];
  let chunk: (HeadwordRow | InflectionRow)[] = [];
  let bytes = 2;
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(row)) + 1;
    if (size + 2 > budget) throw new Error(`Oversized search row: ${row[0]}`);
    if (bytes + size > budget) {
      chunks.push(chunk);
      chunk = [];
      bytes = 2;
    }
    chunk.push(row);
    bytes += size;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

export async function writeSearchIndexes(
  outDir: string,
  en: DictionaryEntry[],
  ja: DictionaryEntry[],
): Promise<SearchIndexRef[]> {
  const refs: SearchIndexRef[] = [];
  await mkdir(path.join(outDir, "search"), { recursive: true });
  for (const lang of ["en", "ja"] as const) {
    const rows = searchRows(lang === "en" ? en : ja, lang);
    for (const kind of ["headwords", "inflections"] as const) {
      for (const [index, chunk] of chunkRows(rows[kind]).entries()) {
        const content = JSON.stringify(chunk);
        const file = `search/${lang}-${kind}-${index}.json`;
        await writeFile(path.join(outDir, file), content);
        refs.push({
          lang,
          kind,
          path: `dict/${file}`,
          start: chunk[0]?.[0] ?? "",
          end: chunk.at(-1)?.[0] ?? "",
          entryCount: chunk.length,
          bytes: Buffer.byteLength(content),
          checksum: `sha256:${createHash("sha256").update(content).digest("hex")}`,
        });
      }
    }
  }
  return refs;
}
