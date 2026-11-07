# Eiwa

A mobile-first, one-page English-Japanese / Japanese-English dictionary web
app. Eiwa looks up dictionary facts locally and, if you opt in, runs an AI
model entirely in your browser via [WebLLM](https://webllm.mlc.ai/) for
translation, nuance, and writing correction — no server-side inference, no
accounts, no saved history.

Type an English or Japanese word, phrase, or sentence and get:

- A dictionary translation rendered immediately as the primary baseline,
  with an optional AI translation in its own separate, labeled frame.
- Dictionary facts — headword, reading, part of speech, senses — with source
  attribution.
- Nuance notes and writing correction for phrases/sentences (AI-only).
- Etymology, pronunciation (with browser text-to-speech), derived words, and
  examples, when the dictionary has them.
- Warnings when input is ambiguous, slangy, or context-dependent.

Sections are labeled **Dictionary** or **AI explanation** so it's always
clear what's dictionary-backed versus model-generated. AI never overrides
or blends into the dictionary's primary translation.

## Why it's built this way

- **Free-tier by design.** The app is served entirely as static assets on
  [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).
  The only dynamic Worker route is `/api/health`; every other request is
  served as a static asset without invoking the Worker at all. See
  [`docs/architecture.md`](./docs/architecture.md).
- **No server-side AI.** Translation and explanation inference runs in the
  browser with WebLLM (WebGPU), lazy-loaded only after you explicitly enable
  it in Settings. No API key, login, database, or paid Cloudflare product is
  required.
- **Dictionary facts stay separate from AI output.** Dictionary-backed facts
  (dictionary entries, etymology, pronunciation, derived words) always come
  from `src/dict.ts`, never from the model — see
  [`docs/architecture.md`](./docs/architecture.md#dictionary-vs-ai-separation).
- **Privacy first.** No login, no saved query history, no analytics. See
  [`docs/privacy.md`](./docs/privacy.md).

## Local development

Requires Node.js 22.13+ and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm dev
```

This starts a Vite dev server for the frontend at `http://localhost:5173`.
`/api/health` isn't available under plain `vite dev` (it's a Cloudflare
Worker route); to exercise the full app including the Worker, use:

```bash
pnpm run build
pnpm exec wrangler dev
```

### Checks

```bash
pnpm run check      # typecheck + lint + unit tests
pnpm run build      # regenerate dictionary shards, then production build
pnpm run test:e2e   # Playwright smoke tests (requires browser deps; see below)
pnpm run audit      # pnpm's built-in dependency advisory scan
```

`pnpm run test:e2e` needs Playwright's browser binaries and OS
dependencies (`pnpm exec playwright install --with-deps chromium`). On Linux
this installs system packages and needs `sudo`; CI installs them
automatically.

## Temporary deployment (Cloudflare Temporary Accounts)

Eiwa deploys with [Cloudflare Temporary Accounts](https://blog.cloudflare.com/temporary-accounts/),
so you can build and verify a live preview **without** a Cloudflare login,
API token, or any stored credentials:

```bash
pnpm install
pnpm run build
pnpm run deploy:temporary
```

`wrangler deploy --temporary` will:

1. Solve a proof-of-work challenge and provision a disposable Cloudflare
   account for you.
2. Print a **claim URL** — visit it within the claim window (currently up to
   60 minutes) if you want to keep the deployment under a real Cloudflare
   account. Otherwise the deployment and its temporary account simply expire.
3. Print the live `*.workers.dev` preview URL.

Then smoke-test it:

```bash
pnpm run smoke:url https://<subdomain>.workers.dev
```

This checks that the homepage loads and `GET /api/health` returns
`{"ok":true,"service":"eiwa"}`.

Treat temporary deployments as disposable verification environments: URLs are
not stable, and no production data or secrets should ever be placed there.
See [`docs/release.md`](./docs/release.md) for the full temporary-to-permanent
deployment path.

## Free-tier / architecture guardrails

- No D1, KV, R2, Durable Objects, Queues, Workers AI, or other paid Cloudflare
  bindings are used.
- The Worker script only handles `/api/health`; all other routes are served
  as static assets or the SPA shell, so most traffic never invokes the
  Worker's `fetch` handler, and request bodies are never read.
- The AI model (`@mlc-ai/web-llm`) is loaded from a CDN at runtime rather
  than bundled, because it ships as a single ~6 MB file that exceeds
  Cloudflare Workers Static Assets' 5 MiB per-file limit. See
  [`docs/architecture.md`](./docs/architecture.md#why-webllm-is-loaded-from-a-cdn).
- No user accounts, no login, and no server-side storage of lookup input.

## Dictionary data and licenses

[JMdict/EDICT](https://www.edrdg.org/jmdict/j_jmdict.html) is the production
dictionary source. `scripts/build-jmdict.ts` downloads the SHA-256-pinned
2026-11-07 English JMdict release from EDRDG, streams its XML, and uses the
same shard/manifest pipeline as the fixtures:

```bash
pnpm run dict:build:jmdict       # download/verify/cache and generate real data
pnpm run dict:validate
pnpm run dict:spotcheck          # mountain → 山; 電車 / でんしゃ → train
DICT_SOURCE=jmdict pnpm run build  # preserve source selection through the full build
DICT_SOURCE=jmdict pnpm dev        # optional real-data development
```

Plain `pnpm dev`, `pnpm run build`, unit tests and CI default to the small
CC0-1.0 fixtures (`fixtures/dict/*.json`); they never download JMdict.
An unqualified build regenerates fixtures even after a JMdict build, so use
`DICT_SOURCE=jmdict` for production artifacts. No permanent deployment is
configured.

Japanese lookup indexes written forms and kana readings. English lookup is
an intentionally limited reverse index: **exact normalized first gloss of
the first sense only**, at most four words / 64 characters using ASCII
letters, spaces, apostrophes or hyphens. Other glosses, explanatory glosses,
substring searches, inflections and arbitrary sentences are not indexed.
Entries retain up to three applicable senses and three glosses per sense;
examples and extended metadata are omitted. Shards automatically split to
at most 1 MiB and are fetched only on demand, not precached wholesale.

This publication includes material from the JMdict/EDICT project, property
of the **Electronic Dictionary Research and Development Group (EDRDG)**,
used under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
([EDRDG license and attribution](https://www.edrdg.org/edrdg/licence.html)).
Eiwa's trimmed/indexed dictionary adaptation remains CC BY-SA 4.0; the code
license is separate. The manifest records the source date, URL, SHA-256 and
attribution, reflected in **Settings → Sources & licenses**.

The official download URL rotates daily. The pin fails closed on changed
bytes; retain the verified archive in gitignored `.cache/jmdict/` for
repeat builds. A clean build after upstream rotation needs that cached
snapshot or a deliberate date/hash update (see
[`docs/architecture.md`](./docs/architecture.md#dictionary-shard-flow)).
Neither the archive nor generated `public/dict/` data is committed.
Wiktextract/etymology ingestion remains a follow-up.

## Privacy

Eiwa does not send lookup text to any server-side endpoint, does not run
analytics, and does not save query history. See
[`docs/privacy.md`](./docs/privacy.md) for details.

## Documentation

- [`docs/architecture.md`](./docs/architecture.md) — frontend/Worker/data
  architecture, the WebLLM local-inference flow, dictionary shard flow, and
  fallback behavior.
- [`docs/release.md`](./docs/release.md) — temporary preview workflow, claim
  flow, and the permanent-deployment plan.
- [`docs/privacy.md`](./docs/privacy.md) — no login, no default history,
  local-only inference, no server-side LLM endpoint.

## License

Code is licensed under [AGPL-3.0](./LICENSE). Bundled dictionary data carries
its own source-specific license and attribution (see above and the in-app
Sources & licenses panel).
