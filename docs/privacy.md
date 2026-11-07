# Privacy

Eiwa is designed so that what you type never has to leave your device for
dictionary lookups or AI generation. Optional recorded pronunciation streams
from Wikimedia Commons only when you press Play; the file URL identifies the
recorded word. Text-to-speech depends on your OS/browser voice and may also
use a network service. See the playback sections below.

## No login, no accounts

There is no sign-up, sign-in, or user account system anywhere in the app.
Every visitor gets the same stateless, anonymous experience.

## No default query history

Eiwa does not persist your lookup text anywhere by default:

- No server-side database exists (no D1, KV, R2, or any other storage
  binding is configured — see `wrangler.jsonc`).
- The one dynamic Worker route, `GET /api/health`, never reads a request
  body; `worker/index.ts` is checked by a unit test that asserts this.
- Unless you explicitly save a word or opt into history (see below), the
  browser doesn't persist lookup text or results. Automatic caching is of
  static, non-personal data: dictionary shards (`src/dict-cache.ts`) and the
  downloaded AI model's weights (managed internally by `@mlc-ai/web-llm`).
  One small preferences object is stored in `localStorage` under
  `eiwa:settings:v1` (`src/settings.ts`): whether AI is enabled, the
  selected model ID, and the EN→JA/JA→EN direction override — never your
  lookup text or results.
- No analytics, telemetry, or remote logging library is included.
  `tests/privacy-guard.test.ts` scans the source tree for known
  analytics/remote-logging identifiers (`gtag`, Google Analytics,
  Mixpanel, Segment, Sentry, `sendBeacon`, etc.) and fails if any appear.

## Wordbook and opt-in history

Wordbook & history opens the local learning controls. There are no accounts,
cloud sync, analytics or remote export/import endpoints.

- **Save to wordbook** explicitly persists the query, direction, save timestamp
  and a complete dictionary-only snapshot of the displayed entries (including
  senses, examples, IPA, source attribution and recording URLs). It does not
  persist AI explanations. `localStorage` key: `eiwa:wordbook:v1`, up to 200
  entries / 4 MiB. Reopening uses this snapshot, not a fresh lookup, including
  offline. Media itself is not saved, so Commons playback still needs a network.
- Entries can be deleted or reordered. Export JSON downloads a local backup;
  import reads a user-selected local file, validates it, keeps existing
  snapshots and appends new entries. Export files contain your saved queries;
  handle them as personal data. Nothing is uploaded.
- History is **OFF by default**. The explicit checkbox stores opt-in in
  `eiwa:history-enabled:v1`. Only while enabled, the last 50 queries and their
  directions are stored in `eiwa:history:v1`. No result bodies or AI output.
  Per-item Delete and Clear all history remove these records; switching history
  off erases all of them. Reopening a wordbook snapshot does not add history.
- Clear local cache removes dictionary/model caches, **not** your wordbook,
  history or preferences. Delete saved entries / clear history separately, or
  clear this site's browser storage to erase everything (export first).
- Browser storage is not encrypted by Eiwa. Others using your browser profile
  can read it, and browser eviction/clearing can remove it. Storage failures are
  surfaced; keep an exported backup if entries matter to you.

Tap-to-relookup marks only dictionary-resolved result terms. Resolving terms
loads the same static on-device dictionary indexes; clicking performs an
ordinary local lookup, with no query sent to a search service.

## Dictionary source links

Examples, IPA, etymology and level tags are built into local static shards;
lookups do not contact Tatoeba, Wiktionary, Kaikki or NGSL. Citation/license
links are ordinary optional external links, not background requests. If you
explicitly open an original Wiktionary article or a Tatoeba sentence/profile,
your browser navigates to that site (the destination URL identifies the word,
sentence or contributor). The app sends no referrer with these links.

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
  and `raw.githubusercontent.com` (WebLLM's WASM model libs). Media is separately
  limited by `media-src https://upload.wikimedia.org` for Commons recordings;
  no arbitrary media origin is permitted.
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

## Recorded pronunciation (Commons)

**Play recording (Commons)** streams the selected English pronunciation directly
from `https://upload.wikimedia.org` (Wikimedia Commons); Eiwa does not self-host,
proxy, pre-download or explicitly cache audio. No media `src` is set until Play
is pressed, and `preload="none"` prevents background preload. Browser-native
media caching after playback is browser-controlled.

This user-initiated hotlink sends Commons your IP/browser metadata and a file
URL identifying the recording/word, but no query body or history. The app's
`Referrer-Policy: no-referrer` suppresses the referring page URL. The source link
opens the Commons file page with contributor credits and the file-specific
license; audio licenses may differ from Wiktionary text. Playback failures
(including offline/missing media) do not prevent dictionary display or device
TTS. Commons receives no request merely from looking up or saving a word.

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
  "Text-to-speech" above).
- Wikimedia Commons' handling of recording playback or file-page requests
  (subject to Wikimedia's privacy policy).
- Cloudflare's own infrastructure-level request logs for serving static
  assets (see Cloudflare's own privacy policy for that).
- Hugging Face's hosting of model weight files, or jsDelivr's hosting of the
  WebLLM library file — both receive ordinary anonymous file-download
  requests (for the model/library code, never your lookup text), subject to
  their own respective privacy policies.
