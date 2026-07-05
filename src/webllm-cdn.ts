/**
 * `@mlc-ai/web-llm` ships as a single ~6 MB pre-bundled ESM file, which
 * exceeds Cloudflare Workers Static Assets' 5 MiB per-file limit
 * (https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
 * It is loaded from a CDN at runtime instead of being bundled into our own
 * static assets. The package has no bare-specifier imports of its own (it
 * inlines its only dependency, `loglevel`), so a plain jsDelivr file URL
 * works without needing an ESM-resolving proxy CDN.
 *
 * `@mlc-ai/web-llm` stays a devDependency purely for its TypeScript types;
 * `import type` / `typeof import(...)` are erased at build time and never
 * pull the runtime code into our bundle.
 */
export const WEBLLM_VERSION = "0.2.84";

/**
 * SHA-256 (hex) of the exact bytes jsDelivr serves at WEBLLM_CDN_URL for
 * WEBLLM_VERSION. Dynamic `import()` can't carry an SRI `integrity`
 * attribute, so `loadWebLlm` fetches, hashes, and verifies manually before
 * executing the code. Recompute after bumping WEBLLM_VERSION with:
 *   curl -s https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@<version>/lib/index.js | sha256sum
 * `webllm-cdn.test.ts` fails if this drifts from WEBLLM_VERSION without
 * being updated deliberately.
 */
export const WEBLLM_SHA256 = "4917bf1b8969ca20a0b74b2773cbc9c14f77ce7427df491cd56c252f9a6070c7";

export const WEBLLM_CDN_URL = `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${WEBLLM_VERSION}/lib/index.js`;

export type WebLlmModule = typeof import("@mlc-ai/web-llm");

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fetches the WebLLM library as bytes, verifies its SHA-256 hash against the
 * pinned WEBLLM_SHA256, and only then executes it, via a blob URL (dynamic
 * `import()` has no `integrity` parameter). A hash mismatch — e.g. a
 * compromised or coerced CDN response — throws instead of ever executing the
 * fetched code; callers already treat a rejected loadWebLlm() as a normal
 * model-load failure (see `ensureReady()` in `src/llm.ts`).
 */
export async function loadWebLlm(): Promise<WebLlmModule> {
  const response = await fetch(WEBLLM_CDN_URL);
  if (!response.ok) {
    throw new Error(`webllm-fetch-failed: ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  if (bufferToHex(digest) !== WEBLLM_SHA256) {
    throw new Error("webllm-integrity-mismatch");
  }
  // Not revoked: the module may be evaluated lazily by the engine after this
  // function returns, and the library has no relative imports of its own
  // (see docs/architecture.md) so keeping the blob URL alive costs one
  // ~6 MB blob for the lifetime of the tab, not a leak per lookup.
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "text/javascript" }));
  return (await import(/* @vite-ignore */ blobUrl)) as WebLlmModule;
}
