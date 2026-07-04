import type { DictionaryEntry, DictManifest } from "./dict-types";

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
