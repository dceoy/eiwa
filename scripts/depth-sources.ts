/** Official artifacts: verify caches and fail closed when rotating endpoints change. */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export const DEPTH_PINS = {
  "tatoeba-eng": {
    version: "2026-11-07",
    file: "tatoeba-eng-2026-11-07.bz2",
    url: "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_detailed.tsv.bz2",
    bytes: 34983679,
    sha256: "afec98e4c44a72f8fc709ce4d672fd3ab7f9ca731402f5d35e384b0b21b207c5",
  },
  "tatoeba-jpn": {
    version: "2026-11-07",
    file: "tatoeba-jpn-2026-11-07.bz2",
    url: "https://downloads.tatoeba.org/exports/per_language/jpn/jpn_sentences_detailed.tsv.bz2",
    bytes: 4462852,
    sha256: "14e7b047fca3721291bc16c4e9a3b5f967ebdb9b34f704aff9a8b50d0d1d1501",
  },
  "tatoeba-links": {
    version: "2026-11-07",
    file: "tatoeba-links-2026-11-07.tar.bz2",
    url: "https://downloads.tatoeba.org/exports/links.tar.bz2",
    bytes: 150515693,
    sha256: "c8ed4ce074b8a07538c8ca464e97975c61ee379636e45dbc5c464b2943493ab6",
  },
  Wiktextract: {
    version: "enwiktionary-2026-10-01/extracted-2026-10-30/19f9a30",
    file: "kaikki-English-2026-10-30.jsonl.gz",
    url: "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz",
    bytes: 534186395,
    sha256: "4d03b6cba283744756c57ff661c2c6cbfe34fcf8ff513a966576cf7d97e91a99",
  },
  NGSL: {
    version: "1.2-2023-04",
    file: "NGSL-1.2.csv",
    url: "https://static1.squarespace.com/static/64336926d7c6bb38965fdf3b/t/644e0be4ad7bae3d45b9e62a/1682836452194/NGSL_1.2_stats.csv",
    bytes: 62566,
    sha256: "2098bab8955a120a9766c6282a51d7d578c6cb0a7d946600d2ffb73ba25a0b44",
  },
} as const;

export async function verifyDepthFile(file: string, expected: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const actual = hash.digest("hex");
  if (actual !== expected)
    throw new Error(`${file}: SHA-256 mismatch: ${actual}; expected ${expected}`);
}

export async function depthArchive(name: keyof typeof DEPTH_PINS): Promise<string> {
  const pin = DEPTH_PINS[name];
  const dir = path.resolve(import.meta.dirname, "../.cache/depth");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, pin.file);
  try {
    await verifyDepthFile(file, pin.sha256);
    return file;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const head = await fetch(pin.url, { method: "HEAD", signal: AbortSignal.timeout(60_000) });
  if (!head.ok || Number(head.headers.get("content-length")) !== pin.bytes)
    throw new Error(
      `${name}: download size changed or unknown; inspect source before updating pins`,
    );
  const partial = `${file}.part`;
  try {
    const response = await fetch(pin.url, { signal: AbortSignal.timeout(1_200_000) });
    if (!response.ok || !response.body) throw new Error(`${name}: HTTP ${response.status}`);
    await pipeline(response.body, createWriteStream(partial));
    await verifyDepthFile(partial, pin.sha256);
    await rename(partial, file);
  } finally {
    await rm(partial, { force: true });
  }
  return file;
}

export function depthVersions(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(DEPTH_PINS).flatMap(([name, pin]) => [
      [name, pin.version],
      [`${name}.url`, pin.url],
      [`${name}.sha256`, pin.sha256],
    ]),
  );
}
