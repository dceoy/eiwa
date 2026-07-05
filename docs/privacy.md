# Privacy

Eiwa is designed so that what you type never has to leave your device for
dictionary lookups or AI generation. The one exception is text-to-speech
playback, which depends on your OS/browser voice — see
["Text-to-speech (Listen)"](#text-to-speech-listen) below.

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
  One small preferences object is stored in `localStorage` under
  `eiwa:settings:v1` (`src/settings.ts`): whether AI is enabled, the
  selected model ID, and the EN→JA/JA→EN direction override — never your
  lookup text or results.
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
- The `@mlc-ai/web-llm` _library code_ (not the model weights) is loaded
  from a CDN (jsDelivr) at runtime because it exceeds Cloudflare's static
  asset size limit — see
  [`docs/architecture.md`](./architecture.md#why-webllm-is-loaded-from-a-cdn).
  This is a code fetch, not a data fetch: no lookup text is included in
  that request. Before executing it, Eiwa hashes the fetched bytes and
  checks them against a hash pinned in source (`src/webllm-cdn.ts`); a
  mismatch — e.g. a compromised CDN response — aborts the load instead of
  ever running the code.
- Generation happens inside a Web Worker running the model with WebGPU. No
  network request containing your lookup text is made during translation,
  nuance generation, or writing correction.
- Settings → "Clear local cache" removes both the cached dictionary shards
  and the downloaded model weights from your browser.

## Content-Security-Policy

`public/_headers` serves a Content-Security-Policy (plus `X-Content-Type-Options`,
`Referrer-Policy: no-referrer`, and a restrictive `Permissions-Policy`) on every
response, enforced by the browser rather than relying solely on code review:

- `default-src 'self'` with everything else (`object-src`, `base-uri`,
  `frame-ancestors`) locked down, so a compromised dependency can't embed the
  page, submit forms elsewhere, or load a plugin.
- `connect-src` allow-lists exactly the hosts the app fetches from at
  runtime: `cdn.jsdelivr.net` (the WebLLM library bytes, integrity-checked —
  see above), `huggingface.co`/`*.huggingface.co`/`*.hf.co` (model weights),
  and `raw.githubusercontent.com` (WebLLM's WASM model libs). No other origin
  can be reached even by injected code.
- `script-src 'self' blob: 'wasm-unsafe-eval'` — `blob:` is required because
  the hash-verified WebLLM library is executed from a `Blob`-backed URL, not
  a network script tag (see the CDN integrity check above); `wasm-unsafe-eval`
  is required for WebGPU/WASM execution.

**Limits:** CSP constrains _where_ code can run and _which origins_ can be
reached — it cannot stop a malicious script from misusing an
already-allow-listed origin (e.g. encoding data into a request path to
`huggingface.co`). It is a defense-in-depth backstop on top of, not a
replacement for, the no-network-fetch-of-lookup-text design described above
and the CDN integrity check.

## No server-side LLM endpoint

There is no Workers AI binding, no third-party LLM API call, and no
server-side inference of any kind in this codebase. The Worker's only job
is to serve static assets and answer `/api/health`.

## Dictionary lookups

Dictionary lookups fetch small, pre-built, non-personal JSON shard files
(`/dict/<lang>/<key>.json`) that contain the dictionary itself, not your
query. Your search term determines _which_ shard is requested (e.g. looking
up "cat" fetches `/dict/en/c.json`), but the request never includes your
full input as a parameter or body — it's just a normal static-file GET.

## Text-to-speech (Listen)

The 🔊 Listen buttons call the browser's built-in `speechSynthesis` API
(`src/speech.ts`) with the translation text or, on the Pronunciation card,
your own input (`result.pronunciation.audioText ?? result.input`). This text
is handed to whatever voice your OS/browser has selected. Most desktop
platforms use on-device voices, but some platforms — notably several
Android system voices and other "network" voices offered by browsers —
synthesize speech using a cloud service, which means the spoken text can
leave your device via a request Eiwa does not make and cannot see or block.
If this matters to you, check your OS/browser voice settings and prefer a
voice marked local/offline (`speechSynthesis.getVoices()` exposes a
`localService` flag your OS voice picker UI typically reflects).

## What this doesn't cover

This document describes Eiwa's own code and default configuration. It does
not (and cannot) describe the behavior of:

- Your browser or OS, including which text-to-speech voice it uses (see
  "Text-to-speech" above for the one case we can name specifically).
- Cloudflare's own infrastructure-level request logs for serving static
  assets (see Cloudflare's own privacy policy for that).
- Hugging Face's hosting of model weight files, or jsDelivr's hosting of the
  WebLLM library file — both receive ordinary anonymous file-download
  requests (for the model/library code, never your lookup text), subject to
  their own respective privacy policies.
