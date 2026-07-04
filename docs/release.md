# Release path

Eiwa is designed to be built and verified with **Cloudflare Temporary
Accounts** first, and to move to a permanent Cloudflare account only when
there's something worth keeping a permanent URL for.

## Roadmap status

| Phase                            | Scope                                                                                  | Status                  |
| -------------------------------- | -------------------------------------------------------------------------------------- | ----------------------- |
| 0 — Deployable shell             | Workers Static Assets app shell, `/api/health`, temporary deploy (#1)                  | Done                    |
| 1 — Dictionary-first MVP         | Fixture-backed dictionary, mobile-first UI, PWA shell, sources/licenses modal (#3, #5) | Done                    |
| 2 — Browser-side AI              | WebLLM in a Web Worker, structured JSON, dictionary+AI merge, WebGPU fallback (#2, #4) | Done                    |
| 3 — Quality & privacy hardening  | CI, unit + e2e tests, privacy guard, free-tier guardrails (#6)                         | Done                    |
| 4 — Permanent Cloudflare account | Claim or otherwise provision a permanent account; production deployment instructions   | Not started — see below |

## Temporary Accounts workflow

This is the default workflow for local development and for verifying any
change (including in CI-adjacent agent workflows) — it requires **no**
Cloudflare login, API token, or stored credentials:

```bash
pnpm install
pnpm run build
pnpm run deploy:temporary          # wrangler deploy --temporary
pnpm run smoke:url <printed-url>   # optional scripted smoke check
```

`wrangler deploy --temporary`:

1. Solves a proof-of-work challenge and provisions a disposable Cloudflare
   account (no signup flow).
2. Prints a **claim URL**. Visiting it lets you attach the deployment (and
   its temporary account) to a real Cloudflare account before the claim
   window elapses.
3. Prints a live `*.workers.dev` URL immediately usable for manual or
   scripted smoke testing.

**Policy:**

- Treat every temporary deployment as disposable. Its URL is not stable and
  should never be linked to from anywhere permanent.
- Never put production data or secrets in a temporary deployment — there is
  no meaningful data in this app to begin with (no accounts, no server-side
  storage), which is exactly why temporary deployments are safe to use
  freely here.
- Don't block iteration on Cloudflare login/OAuth/custom domains. If a
  temporary deployment expires before you claim it, just redeploy.

## Claim flow

If a temporary preview is worth keeping:

1. Open the claim URL printed by `wrangler deploy --temporary` before it
   expires.
2. Sign in to (or create) a Cloudflare account to attach the Worker to it.
3. From that point, the Worker behaves like a normal Cloudflare account
   deployment and can be managed from the dashboard or via a
   credentialed `wrangler deploy`.

## Permanent deployment (not yet configured)

This repository does not currently assume a permanent Cloudflare account
exists, and no CI workflow deploys anywhere automatically. When a permanent
deployment is actually wanted:

1. Claim a temporary deployment (above), or run `wrangler deploy` from a
   machine authenticated against a real Cloudflare account
   (`wrangler login` or `CLOUDFLARE_API_TOKEN`).
2. Only then add a deployment job to CI, using a repository secret for the
   API token — never commit credentials, and never require them for the
   existing `check`/`e2e` CI jobs, which must keep working for any
   contributor without Cloudflare access.
3. Add a custom domain / route in `wrangler.jsonc` if desired.

Until this happens, treat any statement about a "production" or "live"
Eiwa deployment as false — only temporary preview URLs exist.

## Free-tier architecture guardrails

These constraints are enforced by design and should be preserved by future
changes:

- Serve the app as static assets wherever possible; keep the Worker's
  dynamic route surface to `/api/health` only, and avoid `run_worker_first`
  unless a real need is proven.
- No D1, KV, R2, Durable Objects, Queues, or Workers AI. AI inference runs
  in the browser (WebLLM), never in the Worker.
- No paid Cloudflare product is required for `pnpm install`, `pnpm run
check`, `pnpm run build`, `wrangler deploy --temporary`, or CI.
- Any single static asset must stay under Cloudflare Workers Static Assets'
  5 MiB per-file limit — this is why `@mlc-ai/web-llm` is loaded from a CDN
  at runtime instead of bundled (see
  [`docs/architecture.md`](./architecture.md#why-webllm-is-loaded-from-a-cdn)).

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`, and requires
no Cloudflare secrets:

- `check`: install, `pnpm run check` (typecheck + lint + unit tests),
  `pnpm run build`.
- `e2e`: install, `pnpm exec playwright install --with-deps chromium`,
  `pnpm run test:e2e` (builds and serves via `wrangler dev` internally, per
  `playwright.config.ts`).

Neither job deploys anywhere; deployment (temporary or otherwise) remains a
manual, explicit action.
