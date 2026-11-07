import { cachedFetch, cacheManifestResponse, matchCachedManifest } from "./dict-cache";
import { normalizeHeadword, resolveShardKey } from "./dict-normalize";
import type {
  DictionaryEntry,
  DictionarySource,
  DictLang,
  DictManifest,
  HeadwordRow,
  InflectionRow,
  SearchIndexRef,
} from "./dict-types";
import { validateManifest, validateShardPayload } from "./dict-validate";
import {
  editDistance,
  lexical,
  MAX_SEARCH_LENGTH,
  RESULT_LIMIT,
  rankHeadwords,
  SUGGESTION_LIMIT,
  validateSearchRows,
} from "./search-index";

const MANIFEST_URL = "/dict/manifest.json";

let manifestPromise: Promise<DictManifest> | null = null;
const shardKeys: Record<DictLang, Set<string>> = { en: new Set(), ja: new Set() };

/**
 * Network-first with cache fallback: prefer a fresh manifest whenever the
 * network is reachable (so checksums/shard references never go stale while
 * online), but fall back to the last successfully fetched manifest so an
 * offline launch can still serve previously cached shards instead of failing
 * outright.
 */
async function fetchManifest(): Promise<Response> {
  try {
    const response = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load dictionary manifest: HTTP ${response.status}`);
    }
    // Best-effort: a fresh response must still be used even if persisting it
    // for offline fallback fails (e.g. CacheStorage quota/transient error).
    await cacheManifestResponse(MANIFEST_URL, response.clone()).catch(() => undefined);
    return response;
  } catch (error) {
    const cached = await matchCachedManifest(MANIFEST_URL);
    if (cached) return cached;
    throw error;
  }
}

async function loadManifest(): Promise<DictManifest> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const response = await fetchManifest();
      const data = await response.json();
      const issues = validateManifest(data);
      if (issues.length > 0) {
        throw new Error(`Invalid dictionary manifest: ${issues[0]?.message}`);
      }
      const manifest = data as DictManifest;
      for (const lang of ["en", "ja"] as const) {
        shardKeys[lang] = new Set(
          manifest.shards.filter((ref) => ref.lang === lang).map((ref) => ref.key),
        );
      }
      return manifest;
    })().catch((error: unknown) => {
      manifestPromise = null;
      throw error;
    });
  }
  return manifestPromise;
}

const shardCache = new Map<string, Promise<Record<string, DictionaryEntry[]>>>();

async function loadShard(lang: DictLang, key: string): Promise<Record<string, DictionaryEntry[]>> {
  const cacheKey = `${lang}:${key}`;
  let pending = shardCache.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const manifest = await loadManifest();
      const ref = manifest.shards.find((shard) => shard.lang === lang && shard.key === key);
      if (!ref) {
        return {};
      }

      // The checksum makes this a content-addressed URL: if the shard's
      // content ever changes, the URL changes with it, so a previously
      // cached (now stale) response for the old URL is simply never
      // requested again.
      const response = await cachedFetch(`/${ref.path}?v=${encodeURIComponent(ref.checksum)}`);
      if (!response.ok) {
        throw new Error(`Failed to load dictionary shard ${ref.path}: HTTP ${response.status}`);
      }
      const data = await response.json();
      const issues = validateShardPayload(data);
      if (issues.length > 0) {
        throw new Error(`Invalid dictionary shard ${ref.path}: ${issues[0]?.message}`);
      }
      return (data as { entries: Record<string, DictionaryEntry[]> }).entries;
    })().catch((error: unknown) => {
      shardCache.delete(cacheKey);
      throw error;
    });
    shardCache.set(cacheKey, pending);
  }
  return pending;
}

const searchCache = new Map<string, Promise<HeadwordRow[] | InflectionRow[]>>();
async function loadSearch(ref: SearchIndexRef): Promise<HeadwordRow[] | InflectionRow[]> {
  let pending = searchCache.get(ref.path);
  if (!pending) {
    pending = (async () => {
      const response = await cachedFetch(`/${ref.path}?v=${encodeURIComponent(ref.checksum)}`);
      if (!response.ok) throw new Error(`Failed to load search index ${ref.path}`);
      const data: unknown = await response.json();
      if (
        !validateSearchRows(data, ref.kind) ||
        data.length !== ref.entryCount ||
        data[0]?.[0] !== ref.start ||
        data.at(-1)?.[0] !== ref.end
      )
        throw new Error(`Invalid search index ${ref.path}`);
      return data;
    })().catch((error: unknown) => {
      searchCache.delete(ref.path);
      throw error;
    });
    searchCache.set(ref.path, pending);
  }
  return pending;
}
async function headwords(lang: DictLang, prefix?: string): Promise<HeadwordRow[]> {
  const manifest = await loadManifest();
  const rows: HeadwordRow[] = [];
  for (const ref of manifest.search ?? []) {
    if (
      ref.lang !== lang ||
      ref.kind !== "headwords" ||
      (prefix && (ref.end < prefix || ref.start > `${prefix}\uffff`))
    )
      continue;
    rows.push(...((await loadSearch(ref)) as HeadwordRow[]));
  }
  return rows;
}

/** Resolve only exact indexed terms; no fuzzy/prefix matches or external APIs. */
export async function resolveHeadwords(terms: string[], lang: DictLang): Promise<Set<string>> {
  const queries = new Set(terms.map((term) => normalizeHeadword(term, lang)));
  const found = new Set<string>();
  const manifest = await loadManifest();
  for (const ref of manifest.search ?? []) {
    if (
      ref.lang !== lang ||
      ref.kind !== "headwords" ||
      ![...queries].some((q) => q >= ref.start && q <= ref.end)
    )
      continue;
    for (const [word] of (await loadSearch(ref).catch(() => [])) as HeadwordRow[])
      if (queries.has(word)) found.add(word);
  }
  return found;
}

/** Prefix-only typing assistance: fetch only intersecting sorted ranges. */
export async function suggestHeadwords(query: string, lang: DictLang): Promise<string[]> {
  const q = normalizeHeadword(query, lang);
  if (!q || q.length > MAX_SEARCH_LENGTH) return [];
  return (await headwords(lang, q))
    .filter(([word]) => word.startsWith(q))
    .sort(rankHeadwords)
    .slice(0, SUGGESTION_LIMIT)
    .map(([word]) => word);
}

/** Suggestions are never silently treated as dictionary hits. */
export async function suggestSpellings(query: string, lang: DictLang): Promise<string[]> {
  const q = normalizeHeadword(query, lang);
  if (q.length < 3 || q.length > MAX_SEARCH_LENGTH || /[.!?。！？]/.test(q)) return [];
  const limit = q.length < 5 ? 1 : 2;
  return (await headwords(lang))
    .map((row) => ({ row, distance: editDistance(q, row[0], limit) }))
    .filter(({ distance }) => distance > 0 && distance <= limit)
    .sort((a, b) => a.distance - b.distance || rankHeadwords(a.row, b.row))
    .slice(0, SUGGESTION_LIMIT)
    .map(({ row }) => row[0]);
}
async function exactEntries(normalized: string, lang: DictLang): Promise<DictionaryEntry[]> {
  const key = resolveShardKey(normalized, lang, shardKeys[lang]);
  if (!key) return [];
  const entries = await loadShard(lang, key);
  return Object.hasOwn(entries, normalized) ? (entries[normalized] ?? []) : [];
}

/** Exact > lemma > prefix > substring; frequency orders each tier. No AI. */
export async function lookupDictionary(query: string, lang: DictLang): Promise<DictionaryEntry[]> {
  const q = normalizeHeadword(query, lang);
  if (!q) return [];
  const manifest = await loadManifest();
  const result = [...(await exactEntries(q, lang))].slice(0, RESULT_LIMIT);
  if (q.length > MAX_SEARCH_LENGTH || !manifest.search) return result;
  const seen = new Set(result.map((entry) => entry.id));
  const add = (entries: DictionaryEntry[], kind: "inflection" | "prefix" | "partial") => {
    for (const entry of entries) {
      if (result.length >= RESULT_LIMIT) break;
      if (!seen.has(entry.id)) {
        result.push({ ...entry, match: { kind, query: q } });
        seen.add(entry.id);
      }
    }
  };
  // Optional indexes/related shards may be absent offline. Keep every hit
  // already loaded, and let independent enrichment candidates still succeed.
  const lemmas = new Set<string>();
  for (const ref of manifest.search) {
    if (ref.kind !== "inflections" || ref.lang !== lang || q < ref.start || q > ref.end) continue;
    for (const [form, targets] of (await loadSearch(ref).catch(() => [])) as InflectionRow[])
      if (form === q) for (const target of targets) lemmas.add(target);
  }
  const resolved = (
    await Promise.all([...lemmas].map((lemma) => exactEntries(lemma, lang).catch(() => [])))
  ).flat();
  add(
    resolved.sort(
      (a, b) => (b.frequency ?? 0) - (a.frequency ?? 0) || lexical(a.headword, b.headword),
    ),
    "inflection",
  );
  if (result.length >= RESULT_LIMIT || q.length < 2) return result;
  const rows = await headwords(lang).catch(() => []);
  const prefix = rows
    .filter(([word]) => word !== q && word.startsWith(q))
    .sort(rankHeadwords)
    .slice(0, SUGGESTION_LIMIT);
  const partial = rows
    .filter(([word]) => !word.startsWith(q) && word.includes(q))
    .sort(rankHeadwords)
    .slice(0, SUGGESTION_LIMIT);
  for (const [kind, candidates] of [
    ["prefix", prefix],
    ["partial", partial],
  ] as const) {
    for (const [word] of candidates) add(await exactEntries(word, lang).catch(() => []), kind);
  }
  return result;
}

export async function dictionaryLicenses(): Promise<DictionarySource[]> {
  const manifest = await loadManifest();
  return manifest.licenses;
}

export interface DictionaryManifestInfo {
  builtAt: string;
  sourceVersions: DictManifest["sourceVersions"];
  shardCount: number;
}

export async function dictionaryManifestInfo(): Promise<DictionaryManifestInfo> {
  const manifest = await loadManifest();
  return {
    builtAt: manifest.builtAt,
    sourceVersions: manifest.sourceVersions,
    shardCount: manifest.shards.length,
  };
}

/** Drops in-memory manifest/shard state so the next lookup re-fetches from
 * scratch. Pair with `clearDictionaryCache()` (CacheStorage) so "Clear local
 * cache" actually clears everything, not just the persistent cache. */
export function resetDictionaryCaches(): void {
  manifestPromise = null;
  shardCache.clear();
  searchCache.clear();
  shardKeys.en.clear();
  shardKeys.ja.clear();
}
