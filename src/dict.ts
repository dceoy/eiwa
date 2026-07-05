import { cachedFetch, cacheManifestResponse, matchCachedManifest } from "./dict-cache";
import { normalizeHeadword, shardKeyFor } from "./dict-normalize";
import type { DictionaryEntry, DictionarySource, DictLang, DictManifest } from "./dict-types";
import { validateManifest, validateShardPayload } from "./dict-validate";

const MANIFEST_URL = "/dict/manifest.json";

let manifestPromise: Promise<DictManifest> | null = null;

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
    await cacheManifestResponse(MANIFEST_URL, response.clone());
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
      return data as DictManifest;
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

/** Looks up dictionary entries for a normalized headword. Never touches WebLLM. */
export async function lookupDictionary(query: string, lang: DictLang): Promise<DictionaryEntry[]> {
  const normalized = normalizeHeadword(query, lang);
  if (!normalized) {
    return [];
  }
  const key = shardKeyFor(normalized, lang);
  const entries = await loadShard(lang, key);
  return entries[normalized] ?? [];
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
}
