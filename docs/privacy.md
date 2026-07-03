# Privacy

Eiwa is designed so that what you type never has to leave your device.

## No login, no accounts

There is no sign-up, sign-in, or user account system anywhere in the app.
Every visitor gets the same stateless, anonymous experience.

## No default query history

Eiwa does not persist your lookup text anywhere by default:

- No server-side database exists (no D1, KV, R2, or any other storage
  binding is configured — see `wrangler.jsonc`).
- The one dynamic Worker route, `GET /api/health`, never reads a request
  body; `worker/index.ts` is checked by a unit test that asserts this.
- The browser doesn't write lookup text to `localStorage`,
  `IndexedDB`, or any cache. The only client-side caching is of static,
  non-personal data: dictionary shards (`src/dict-cache.ts`) and the
  downloaded AI model's weights (managed internally by `@mlc-ai/web-llm`).
- No analytics, telemetry, or remote logging library is included.
  `tests/privacy-guard.test.ts` scans the source tree for known
  analytics/remote-logging identifiers (`gtag`, Google Analytics,
  Mixpanel, Segment, Sentry, `sendBeacon`, etc.) and fails if any appear.

## Local-only AI inference

Translation, nuance, and writing-correction generation run **entirely in
your browser** via [WebLLM](https://webllm.mlc.ai/), using WebGPU:

- The model is not downloaded until you explicitly enable it in
  Settings → "Enable AI explanations." Nothing is fetched automatically on
  page load.
- Once enabled, the model itself (weights) is fetched directly by your
  browser from Hugging Face and cached locally; your lookup text is never
  sent there — only the model file downloads happen over the network from
  that source, no user text.
- The `@mlc-ai/web-llm` *library code* (not the model weights) is loaded
  from a CDN (jsDelivr) at runtime because it exceeds Cloudflare's static
  asset size limit — see
  [`docs/architecture.md`](./architecture.md#why-webllm-is-loaded-from-a-cdn).
  This is a code fetch, not a data fetch: no lookup text is included in
  that request.
- Generation happens inside a Web Worker running the model with WebGPU. No
  network request containing your lookup text is made during translation,
  nuance generation, or writing correction.
- Settings → "Clear local cache" removes both the cached dictionary shards
  and the downloaded model weights from your browser.

## No server-side LLM endpoint

There is no Workers AI binding, no third-party LLM API call, and no
server-side inference of any kind in this codebase. The Worker's only job
is to serve static assets and answer `/api/health`.

## Dictionary lookups

Dictionary lookups fetch small, pre-built, non-personal JSON shard files
(`/dict/<lang>/<key>.json`) that contain the dictionary itself, not your
query. Your search term determines *which* shard is requested (e.g. looking
up "cat" fetches `/dict/en/c.json`), but the request never includes your
full input as a parameter or body — it's just a normal static-file GET.

## What this doesn't cover

This document describes Eiwa's own code and default configuration. It does
not (and cannot) describe the behavior of:

- Your browser or OS.
- Cloudflare's own infrastructure-level request logs for serving static
  assets (see Cloudflare's own privacy policy for that).
- Hugging Face's hosting of model weight files, or jsDelivr's hosting of the
  WebLLM library file — both receive ordinary anonymous file-download
  requests (for the model/library code, never your lookup text), subject to
  their own respective privacy policies.
