/** Manual, offline benchmark. Never builds/downloads data or invokes AI. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dictionaryManifestInfo, lookupDictionary, resetDictionaryCaches } from "../src/dict";
import { normalizeHeadword } from "../src/dict-normalize";
import type { DictionaryEntry, DictLang } from "../src/dict-types";
import { sourceLangFor, targetLangFor } from "../src/language";

export const CATEGORIES = [
  "single-word",
  "inflected-form",
  "phrase-idiom",
  "ambiguous-common",
  "sentence-short-phrase",
] as const;
export const DIRECTIONS = ["en-ja", "ja-en"] as const;
export interface LookupQuery {
  id: string;
  input: string;
  direction: (typeof DIRECTIONS)[number];
  category: (typeof CATEGORIES)[number];
  expected: { headword: string; senses: string[] }[];
}
export interface Score {
  exact: boolean;
  top1: boolean;
  miss: boolean;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function isQuery(value: unknown): value is LookupQuery {
  if (!value || typeof value !== "object") return false;
  const q = value as LookupQuery;
  return (
    nonempty(q.id) &&
    q.id.startsWith("v1-") &&
    nonempty(q.input) &&
    DIRECTIONS.includes(q.direction) &&
    CATEGORIES.includes(q.category) &&
    Array.isArray(q.expected) &&
    q.expected.length > 0 &&
    q.expected.every(
      (e) =>
        e &&
        nonempty(e.headword) &&
        Array.isArray(e.senses) &&
        e.senses.length > 0 &&
        e.senses.every(nonempty),
    )
  );
}

export function parseQueries(text: string): LookupQuery[] {
  const ids = new Set<string>();
  const inputs = new Set<string>();
  const queries: LookupQuery[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`queries.jsonl:${index + 1}: invalid JSON`);
    }
    if (!isQuery(value)) throw new Error(`queries.jsonl:${index + 1}: invalid v1 query`);
    const key = `${value.direction}:${normalizeHeadword(value.input, sourceLangFor(value.direction))}`;
    if (ids.has(value.id) || inputs.has(key)) {
      throw new Error(`queries.jsonl:${index + 1}: duplicate id or input/direction`);
    }
    ids.add(value.id);
    inputs.add(key);
    queries.push(value);
  }
  if (!queries.length) throw new Error("Query set is empty");
  return queries;
}

/** Only a trailing English parenthetical qualifier may extend a curated sense. */
function senseMatches(actual: string, expected: string, lang: DictLang): boolean {
  const a = normalizeHeadword(actual, lang);
  const e = normalizeHeadword(expected, lang);
  return a === e || (lang === "en" && a.startsWith(`${e} (`) && a.endsWith(")"));
}

export function scoreLookup(query: LookupQuery, entries: DictionaryEntry[]): Score {
  const lang = sourceLangFor(query.direction);
  const target = targetLangFor(query.direction);
  const normalize = (text: string) => normalizeHeadword(text, lang);
  const first = entries[0];
  const translation = first?.translations[0];
  return {
    exact: entries.some((entry) => normalize(entry.headword) === normalize(query.input)),
    top1: Boolean(
      first &&
        translation?.lang === target &&
        query.expected.some(
          (expected) =>
            normalize(first.headword) === normalize(expected.headword) &&
            expected.senses.some((sense) => senseMatches(translation.text, sense, target)),
        ),
    ),
    miss: entries.length === 0,
  };
}

/** No fallback to network: foreign URLs fail closed. */
export function localDictionaryFetch(publicDir: string): typeof fetch {
  const dictDir = path.resolve(publicDir, "dict");
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://eiwa.local");
    const pathname = decodeURIComponent(url.pathname);
    const file = path.resolve(publicDir, `.${pathname}`);
    if (
      url.origin !== "http://eiwa.local" ||
      !pathname.startsWith("/dict/") ||
      !file.startsWith(`${dictDir}${path.sep}`)
    ) {
      throw new Error(`Only local dictionary assets may be fetched: ${url.href}`);
    }
    return new Response(await readFile(file, "utf8"), {
      headers: { "content-type": "application/json" },
    });
  };
}

export function requireJmdict(versions: Record<string, string>): void {
  if (
    !versions.JMdict_e ||
    !/^[a-f0-9]{64}$/.test(versions["JMdict_e.sha256"] ?? "") ||
    Object.hasOwn(versions, "eiwa-fixtures")
  ) {
    throw new Error(
      "Production JMdict build required. Run: DICT_SOURCE=jmdict pnpm run dict:build",
    );
  }
}

export function summaryRow(label: string, scores: Score[]): string {
  const rate = (metric: keyof Score) => {
    const count = scores.filter((s) => s[metric]).length;
    return `${count}/${scores.length} (${((count / scores.length) * 100).toFixed(1)}%)`;
  };
  return `| ${label} | ${rate("exact")} | ${rate("top1")} | ${rate("miss")} |`;
}

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

async function main() {
  const text = await readFile(path.join(ROOT, "eval/queries.jsonl"), "utf8");
  const queries = parseQueries(text);
  const originalFetch = globalThis.fetch;
  resetDictionaryCaches();
  globalThis.fetch = localDictionaryFetch(path.join(ROOT, "public"));
  try {
    const info = await dictionaryManifestInfo();
    requireJmdict(info.sourceVersions);
    const manifest = await readFile(path.join(ROOT, "public/dict/manifest.json"), "utf8");
    console.log("Lookup quality v1 — offline JMdict, src/dict.ts (no AI)");
    console.log(
      `Lookup revision: ${execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim()}`,
    );
    console.log(`Queries SHA-256: ${sha256(text)}`);
    console.log(
      `Manifest SHA-256: ${sha256(manifest)}; built at ${info.builtAt}; ${info.shardCount} shards`,
    );
    console.log(`Source versions: ${JSON.stringify(info.sourceVersions)}`);
    const results = [];
    for (const query of queries) {
      // Do not catch lookup failures: a broken asset is not a quality miss.
      const entries = await lookupDictionary(query.input, sourceLangFor(query.direction));
      results.push({ query, entries, score: scoreLookup(query, entries) });
    }
    console.log("\n| Group | Exact hit | Top-1 useful | Miss |");
    console.log("| --- | --- | --- | --- |");
    console.log(
      summaryRow(
        "Overall",
        results.map((r) => r.score),
      ),
    );
    for (const category of CATEGORIES) {
      console.log(
        summaryRow(
          category,
          results.filter((r) => r.query.category === category).map((r) => r.score),
        ),
      );
    }
    for (const direction of DIRECTIONS) {
      console.log(
        summaryRow(
          direction,
          results.filter((r) => r.query.direction === direction).map((r) => r.score),
        ),
      );
    }
    console.log("\nPer-query diagnostics (first headword → first translation):");
    for (const { query, entries, score } of results) {
      const first = entries[0];
      console.log(
        `${query.id} ${JSON.stringify(query.input)}: exact=${+score.exact} top1=${+score.top1} miss=${+score.miss}; ${JSON.stringify(first?.headword ?? null)} → ${JSON.stringify(first?.translations[0]?.text ?? null)} (${entries.length} results)`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    resetDictionaryCaches();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
