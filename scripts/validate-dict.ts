import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeHeadword, resolveShardKey } from "../src/dict-normalize";
import type { DictionaryEntry, DictManifest } from "../src/dict-types";
import { validateManifest, validateShardPayload } from "../src/dict-validate";
import { validateSearchRows } from "../src/search-index";
import { SHARD_TARGET_BYTES } from "./build-dict-shards";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DICT_DIR = path.join(ROOT, "public", "dict");

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

async function main() {
  const errors: string[] = [];

  const manifestRaw = await readFile(path.join(DICT_DIR, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestRaw) as DictManifest;

  for (const issue of validateManifest(manifest)) {
    errors.push(`${issue.path}: ${issue.message}`);
  }

  const keys = {
    en: new Set(manifest.shards.filter((ref) => ref.lang === "en").map((ref) => ref.key)),
    ja: new Set(manifest.shards.filter((ref) => ref.lang === "ja").map((ref) => ref.key)),
  };
  const headwords = { en: new Set<string>(), ja: new Set<string>() };
  const indexWords = { en: new Set<string>(), ja: new Set<string>() };
  const lemmaTargets: { lang: "en" | "ja"; lemma: string }[] = [];
  let totalBytes = Buffer.byteLength(manifestRaw);
  let largestBytes = 0;
  let indexedEntries = 0;
  for (const shard of manifest.shards ?? []) {
    const filePath = path.join(ROOT, "public", shard.path);
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      errors.push(`${shard.path}: file could not be read`);
      continue;
    }

    const actualChecksum = sha256(content);
    if (actualChecksum !== shard.checksum) {
      errors.push(`${shard.path}: checksum mismatch (manifest says ${shard.checksum})`);
    }

    const byteSize = Buffer.byteLength(content, "utf8");
    totalBytes += byteSize;
    largestBytes = Math.max(largestBytes, byteSize);
    if (byteSize > SHARD_TARGET_BYTES) {
      errors.push(
        `${shard.path}: ${byteSize} bytes exceeds the ${SHARD_TARGET_BYTES}-byte per-shard size budget`,
      );
    }

    const payload = JSON.parse(content) as { entries: Record<string, unknown[]> };
    for (const issue of validateShardPayload(payload)) {
      errors.push(`${shard.path} ${issue.path}: ${issue.message}`);
    }

    for (const [normalized, list] of Object.entries(payload.entries ?? {})) {
      headwords[shard.lang].add(normalized);
      if (resolveShardKey(normalized, shard.lang, keys[shard.lang]) !== shard.key) {
        errors.push(`${shard.path}: unroutable lookup bucket ${normalized}`);
      }
      for (const entry of list as DictionaryEntry[]) {
        if (
          ![entry.headword, entry.reading ?? ""].some(
            (word) => normalizeHeadword(word, shard.lang) === normalized,
          )
        ) {
          errors.push(
            `${shard.path}: ${entry.id} is not a headword/reading alias of ${normalized}`,
          );
        }
      }
    }
    const actualCount = Object.values(payload.entries ?? {}).reduce(
      (sum, list) => sum + list.length,
      0,
    );
    indexedEntries += actualCount;
    if (actualCount !== shard.entryCount) {
      errors.push(
        `${shard.path}: entryCount mismatch (manifest says ${shard.entryCount}, found ${actualCount})`,
      );
    }
  }

  for (const ref of manifest.search ?? []) {
    const content = await readFile(path.join(ROOT, "public", ref.path), "utf8");
    const bytes = Buffer.byteLength(content);
    totalBytes += bytes;
    largestBytes = Math.max(largestBytes, bytes);
    if (bytes !== ref.bytes || bytes >= SHARD_TARGET_BYTES || sha256(content) !== ref.checksum)
      errors.push(`${ref.path}: checksum/size mismatch or oversized index`);
    const rows: unknown = JSON.parse(content);
    if (!validateSearchRows(rows, ref.kind)) {
      errors.push(`${ref.path}: invalid sorted search rows`);
      continue;
    }
    if (
      rows.length !== ref.entryCount ||
      rows[0]?.[0] !== ref.start ||
      rows.at(-1)?.[0] !== ref.end
    )
      errors.push(`${ref.path}: count/range mismatch`);
    for (const [word, value] of rows) {
      if (normalizeHeadword(word, ref.lang) !== word)
        errors.push(`${ref.path}: unnormalized key ${word}`);
      if (ref.kind === "headwords") {
        indexWords[ref.lang].add(word);
        if (!headwords[ref.lang].has(word)) errors.push(`${ref.path}: missing headword ${word}`);
      } else if (Array.isArray(value)) {
        for (const lemma of value) lemmaTargets.push({ lang: ref.lang, lemma });
      }
    }
  }
  if (manifest.search) {
    for (const lang of ["en", "ja"] as const)
      for (const word of headwords[lang]) {
        if (!indexWords[lang].has(word)) errors.push(`Search index omits ${lang}:${word}`);
      }
    for (const { lang, lemma } of lemmaTargets)
      if (!headwords[lang].has(lemma)) errors.push(`Inflection target missing: ${lang}:${lemma}`);
  }

  if (errors.length > 0) {
    console.error(`Dictionary validation failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Dictionary validation passed: ${manifest.shards.length} shards, ${manifest.search?.length ?? 0} search indexes, ${indexedEntries} indexed entries (including reading aliases), largest shard ${largestBytes} bytes, total dictionary ${totalBytes} bytes (including manifest).`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
