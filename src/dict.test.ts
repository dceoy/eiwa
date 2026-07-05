import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dictionaryLicenses, lookupDictionary } from "./dict";

const manifest = {
  schemaVersion: 1,
  builtAt: "2026-01-01T00:00:00.000Z",
  sourceVersions: { "eiwa-fixtures": "0.1.0" },
  shards: [
    { lang: "en", key: "c", path: "dict/en/c.json", entryCount: 1, checksum: "sha256:x" },
    { lang: "ja", key: "ね", path: "dict/ja/ね.json", entryCount: 1, checksum: "sha256:y" },
  ],
  licenses: [{ name: "Eiwa Fixture Data", license: "CC0-1.0" }],
};

const enShard = {
  entries: {
    cat: [
      {
        id: "en:cat",
        headword: "cat",
        lang: "en",
        pos: ["noun"],
        translations: [{ text: "猫", lang: "ja" }],
        senses: [{ gloss: "A small domesticated carnivorous mammal." }],
        source: [{ name: "Eiwa Fixture Data", license: "CC0-1.0" }],
      },
    ],
  },
};

const jaShard = {
  entries: {
    ねこ: [
      {
        id: "ja:猫",
        headword: "猫",
        lang: "ja",
        pos: ["noun"],
        translations: [{ text: "cat", lang: "en" }],
        senses: [{ gloss: "A small domesticated carnivorous mammal." }],
        source: [{ name: "Eiwa Fixture Data", license: "CC0-1.0" }],
      },
    ],
  },
};

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 404,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/dict/manifest.json")) return jsonResponse(manifest);
      if (url.includes("/dict/en/c.json")) return jsonResponse(enShard);
      if (url.includes("/dict/ja/ね.json")) return jsonResponse(jaShard);
      return jsonResponse({ error: "not found" }, false);
    }),
  );
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupDictionary", () => {
  it("returns English dictionary entries for a normalized headword", async () => {
    const { lookupDictionary: freshLookup } = await import("./dict");
    const entries = await freshLookup("  CAT ", "en");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.translations[0]?.text).toBe("猫");
  });

  it("returns Japanese dictionary entries for a normalized headword", async () => {
    const { lookupDictionary: freshLookup } = await import("./dict");
    const entries = await freshLookup("ネコ", "ja");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.translations[0]?.text).toBe("cat");
  });

  it("returns an empty array on a dictionary miss without throwing", async () => {
    const { lookupDictionary: freshLookup } = await import("./dict");
    const entries = await freshLookup("nonexistentword", "en");
    expect(entries).toEqual([]);
  });

  it("never sends the lookup query to a remote endpoint", async () => {
    await lookupDictionary("some private lookup text", "en");
    const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    for (const url of calls) {
      expect(url).not.toContain("private");
      expect(url.startsWith("/dict/")).toBe(true);
    }
  });
});

describe("dictionaryLicenses", () => {
  it("exposes bundled dictionary source attribution", async () => {
    const licenses = await dictionaryLicenses();
    expect(licenses).toEqual(manifest.licenses);
  });
});

function createFakeCacheStorage(): CacheStorage {
  const store = new Map<string, Response>();
  const cache = {
    match: async (url: RequestInfo | URL) => {
      const cached = store.get(String(url));
      return cached ? cached.clone() : undefined;
    },
    put: async (url: RequestInfo | URL, response: Response) => {
      store.set(String(url), response.clone());
    },
  };
  return { open: async () => cache, delete: async () => true } as unknown as CacheStorage;
}

describe("loadManifest offline fallback", () => {
  it("serves a previously cached manifest (and shard) when the network becomes unavailable", async () => {
    vi.stubGlobal("caches", createFakeCacheStorage());

    const { lookupDictionary: firstLookup } = await import("./dict");
    const online = await firstLookup("cat", "en");
    expect(online[0]?.translations[0]?.text).toBe("猫");

    // Simulate a fresh (offline) page load: drop in-memory state and make
    // every network request fail.
    vi.resetModules();
    vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error("network down")));

    const { lookupDictionary: offlineLookup } = await import("./dict");
    const offline = await offlineLookup("cat", "en");
    expect(offline[0]?.translations[0]?.text).toBe("猫");
  });

  it("still rejects when offline and nothing was ever cached", async () => {
    vi.stubGlobal("caches", createFakeCacheStorage());
    vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error("network down")));

    const { lookupDictionary: offlineLookup } = await import("./dict");
    await expect(offlineLookup("cat", "en")).rejects.toThrow("network down");
  });
});

describe("resetDictionaryCaches", () => {
  it("clears in-memory manifest/shard state so a subsequent lookup refetches instead of reusing stale data", async () => {
    const { lookupDictionary: freshLookup, resetDictionaryCaches: freshReset } = await import(
      "./dict"
    );

    const first = await freshLookup("cat", "en");
    expect(first[0]?.translations[0]?.text).toBe("猫");

    const updatedShard = {
      entries: {
        cat: [
          {
            ...enShard.entries.cat[0],
            translations: [{ text: "ねこ (updated)", lang: "ja" }],
          },
        ],
      },
    };
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/dict/manifest.json")) return jsonResponse(manifest);
      if (url.includes("/dict/en/c.json")) return jsonResponse(updatedShard);
      return jsonResponse({ error: "not found" }, false);
    });

    // Without a reset, the in-memory shard cache still serves the old data.
    const stillStale = await freshLookup("cat", "en");
    expect(stillStale[0]?.translations[0]?.text).toBe("猫");

    freshReset();

    const afterReset = await freshLookup("cat", "en");
    expect(afterReset[0]?.translations[0]?.text).toBe("ねこ (updated)");
  });
});
