const CACHE_NAME = "eiwa-dict-v1";

/**
 * Fetches a same-origin dictionary asset, serving it from CacheStorage on
 * repeat visits. Falls back to a plain fetch when CacheStorage is
 * unavailable (e.g. some privacy modes or non-browser test environments).
 */
export async function cachedFetch(url: string): Promise<Response> {
  if (typeof caches === "undefined") {
    return fetch(url);
  }

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) {
    return cached;
  }

  const response = await fetch(url);
  if (response.ok) {
    await cache.put(url, response.clone());
  }
  return response;
}

/** Clears cached dictionary shards/manifest so the next lookup re-fetches them. */
export async function clearDictionaryCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  await caches.delete(CACHE_NAME);
}

/** Stores a manifest response for offline fallback. Caller must pass a clone. */
export async function cacheManifestResponse(url: string, response: Response): Promise<void> {
  if (typeof caches === "undefined") return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(url, response);
}

/** Returns the last successfully cached manifest response, if any. */
export async function matchCachedManifest(url: string): Promise<Response | undefined> {
  if (typeof caches === "undefined") return undefined;
  const cache = await caches.open(CACHE_NAME);
  return cache.match(url);
}
