import type { DictionaryEntry, DictManifest } from "./dict-types";
import { isCommonsRecording } from "./recording";

export interface ValidationIssue {
  path: string;
  message: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function validateManifest(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof value !== "object" || value === null) {
    return [{ path: "manifest", message: "manifest must be an object" }];
  }
  const manifest = value as Partial<DictManifest>;

  if (manifest.schemaVersion !== 1) {
    issues.push({ path: "manifest.schemaVersion", message: "expected schemaVersion 1" });
  }
  if (!isNonEmptyString(manifest.builtAt)) {
    issues.push({ path: "manifest.builtAt", message: "expected a non-empty ISO timestamp" });
  }
  if (!Array.isArray(manifest.shards) || manifest.shards.length === 0) {
    issues.push({ path: "manifest.shards", message: "expected at least one shard entry" });
  } else {
    manifest.shards.forEach((shard, index) => {
      if (!isNonEmptyString(shard?.path)) {
        issues.push({ path: `manifest.shards[${index}].path`, message: "missing shard path" });
      }
      if (!isNonEmptyString(shard?.checksum) || !shard.checksum.startsWith("sha256:")) {
        issues.push({
          path: `manifest.shards[${index}].checksum`,
          message: "missing or malformed sha256 checksum",
        });
      }
      if (typeof shard?.entryCount !== "number" || shard.entryCount <= 0) {
        issues.push({
          path: `manifest.shards[${index}].entryCount`,
          message: "expected a positive entryCount",
        });
      }
    });
  }
  if (manifest.search !== undefined) {
    if (!Array.isArray(manifest.search))
      issues.push({ path: "manifest.search", message: "expected an array" });
    else {
      const paths = new Set<string>();
      const ends = new Map<string, string>();
      for (const ref of manifest.search) {
        if (!ref || typeof ref !== "object") {
          issues.push({ path: "manifest.search", message: "expected a search reference object" });
          continue;
        }
        const group = `${ref.lang}:${ref.kind}`;
        if (
          !["en", "ja"].includes(ref.lang) ||
          !["headwords", "inflections"].includes(ref.kind) ||
          !/^dict\/search\/[a-z0-9-]+\.json$/.test(ref.path) ||
          paths.has(ref.path) ||
          !isNonEmptyString(ref.start) ||
          !isNonEmptyString(ref.end) ||
          ref.start > ref.end ||
          (ends.has(group) && ref.start <= (ends.get(group) ?? "")) ||
          !Number.isInteger(ref.entryCount) ||
          ref.entryCount <= 0 ||
          !Number.isInteger(ref.bytes) ||
          ref.bytes <= 0 ||
          ref.bytes >= 1024 * 1024 ||
          !/^sha256:[a-f0-9]{64}$/.test(ref.checksum)
        ) {
          issues.push({
            path: "manifest.search",
            message: "invalid, overlapping or duplicate search reference",
          });
        }
        paths.add(ref.path);
        ends.set(group, ref.end);
      }
    }
  }
  if (!Array.isArray(manifest.licenses) || manifest.licenses.length === 0) {
    issues.push({ path: "manifest.licenses", message: "expected at least one license entry" });
  }

  return issues;
}

export function validateDictionaryEntry(value: unknown, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof value !== "object" || value === null) {
    return [{ path, message: "entry must be an object" }];
  }
  const entry = value as Partial<DictionaryEntry>;

  if (!isNonEmptyString(entry.id)) issues.push({ path: `${path}.id`, message: "missing id" });
  if (!isNonEmptyString(entry.headword)) {
    issues.push({ path: `${path}.headword`, message: "missing headword" });
  }
  if (entry.lang !== "en" && entry.lang !== "ja") {
    issues.push({ path: `${path}.lang`, message: 'lang must be "en" or "ja"' });
  }
  for (const field of ["frequency", "headwordFrequency"] as const) {
    const score = entry[field];
    if (score !== undefined && (!Number.isFinite(score) || score < 0)) {
      issues.push({ path: `${path}.${field}`, message: "expected a non-negative frequency" });
    }
  }
  if (
    entry.level !== undefined &&
    (entry.lang !== "en" || !["basic", "intermediate", "advanced"].includes(entry.level))
  ) {
    issues.push({ path: `${path}.level`, message: "expected an English coarse NGSL band" });
  }
  if (
    entry.etymology !== undefined &&
    (!isNonEmptyString(entry.etymology) || entry.etymology.length > 600)
  )
    issues.push({
      path: `${path}.etymology`,
      message: "expected a trimmed etymology (up to 600 characters)",
    });
  if (
    entry.pronunciation?.ipa !== undefined &&
    (!isNonEmptyString(entry.pronunciation.ipa) || entry.pronunciation.ipa.length > 202)
  )
    issues.push({ path: `${path}.pronunciation.ipa`, message: "invalid or oversized IPA" });
  if (
    entry.pronunciation?.recording !== undefined &&
    (entry.lang !== "en" || !isCommonsRecording(entry.pronunciation.recording))
  )
    issues.push({ path: `${path}.pronunciation.recording`, message: "invalid Commons recording" });
  for (const [field, cap] of [
    ["inflectionForms", 24],
    ["derivedWords", 8],
    ["relatedWords", 8],
  ] as const) {
    const values = entry[field];
    if (
      values !== undefined &&
      (!Array.isArray(values) ||
        values.length > cap ||
        values.some((v) => !isNonEmptyString(v) || v.length > 64))
    )
      issues.push({ path: `${path}.${field}`, message: "invalid or oversized lexical terms" });
  }
  if (entry.examples !== undefined) {
    if (!Array.isArray(entry.examples) || entry.examples.length > 3) {
      issues.push({ path: `${path}.examples`, message: "expected up to three sourced pairs" });
    } else
      for (const pair of entry.examples) {
        for (const lang of ["en", "ja"] as const) {
          const sentence = pair?.[lang];
          if (
            !sentence ||
            !Number.isSafeInteger(sentence.id) ||
            sentence.id <= 0 ||
            !isNonEmptyString(sentence.text) ||
            sentence.text.length > (lang === "en" ? 240 : 120) ||
            !isNonEmptyString(sentence.author) ||
            sentence.author === "\\N"
          )
            issues.push({
              path: `${path}.examples`,
              message: "missing sentence ID, bounded text or contributor attribution",
            });
        }
      }
    if (
      !Array.isArray(entry.source) ||
      !entry.source.some(
        (source) =>
          source?.name === "Tatoeba contributors" &&
          source.license === "CC BY 2.0 FR" &&
          source.licenseUrl === "https://creativecommons.org/licenses/by/2.0/fr/",
      )
    )
      issues.push({ path: `${path}.examples`, message: "missing Tatoeba license attribution" });
  }
  if (!Array.isArray(entry.translations) || entry.translations.length === 0) {
    issues.push({ path: `${path}.translations`, message: "expected at least one translation" });
  }
  if (!Array.isArray(entry.senses) || entry.senses.length === 0) {
    issues.push({ path: `${path}.senses`, message: "expected at least one sense" });
  }
  if (!Array.isArray(entry.source) || entry.source.length === 0) {
    issues.push({ path: `${path}.source`, message: "expected at least one source attribution" });
  }

  return issues;
}

export function validateShardPayload(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof value !== "object" || value === null || !("entries" in value)) {
    return [{ path: "shard", message: "shard must be an object with an `entries` map" }];
  }
  const { entries } = value as { entries: unknown };
  if (typeof entries !== "object" || entries === null) {
    return [{ path: "shard.entries", message: "`entries` must be an object" }];
  }

  for (const [key, list] of Object.entries(entries as Record<string, unknown>)) {
    if (!Array.isArray(list) || list.length === 0) {
      issues.push({ path: `shard.entries.${key}`, message: "expected a non-empty array" });
      continue;
    }
    list.forEach((entry, index) => {
      issues.push(...validateDictionaryEntry(entry, `shard.entries.${key}[${index}]`));
    });
  }

  return issues;
}
