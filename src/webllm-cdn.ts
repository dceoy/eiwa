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
const WEBLLM_VERSION = "0.2.84";
export const WEBLLM_CDN_URL = `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${WEBLLM_VERSION}/lib/index.js`;

export type WebLlmModule = typeof import("@mlc-ai/web-llm");

export async function loadWebLlm(): Promise<WebLlmModule> {
  return (await import(/* @vite-ignore */ WEBLLM_CDN_URL)) as WebLlmModule;
}
