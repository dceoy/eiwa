# Eiwa (英和)

A mobile-first, one-page English-Japanese / Japanese-English dictionary web app.
Eiwa looks up dictionary facts locally and (optionally) runs an AI model
entirely in your browser via [WebLLM](https://webllm.mlc.ai/) for translation,
nuance, and writing correction — no server-side inference, no accounts, no
saved history.

> **Status:** early bootstrap. The deployable app shell and `/api/health`
> endpoint are live; dictionary lookup and WebLLM-powered explanations are
> being built next. See [issues #1–#7](https://github.com/dceoy/eiwa/issues)
> for the implementation plan and `docs/` (added as each phase lands) for
> architecture and release details.

## Why it's built this way

- **Free-tier by design.** The app is served entirely as static assets on
  [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).
  The only dynamic Worker route is `/api/health`; every other request is
  served as a static asset without invoking the Worker at all.
- **No server-side AI.** Translation and explanation inference runs in the
  browser with WebLLM (WebGPU). No API key, login, database, or paid
  Cloudflare product is required.
- **Dictionary facts stay separate from AI output.** Dictionary-backed facts
  and AI-generated commentary are always labeled distinctly in the UI.

## Local development

Requires Node.js 20+ and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm dev
```

This starts a Vite dev server for the frontend. The Worker (`/api/health`)
is exercised via `wrangler dev` or the temporary deployment below.

### Checks

```bash
pnpm run check   # typecheck + lint + unit tests
pnpm run build   # production build (tsc -b && vite build)
```

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
2. Print a **claim URL** — visit it within 60 minutes if you want to keep the
   deployment under a real Cloudflare account. Otherwise the deployment and
   its temporary account simply expire.
3. Print the live `*.workers.dev` preview URL you can open immediately to
   smoke-test the app (including `GET /api/health`, which should return
   `{"ok":true,"service":"eiwa"}`).

Treat temporary deployments as disposable verification environments: URLs are
not stable, and no production data or secrets should ever be placed there.
Permanent Cloudflare deployment instructions will be added only once a
permanent account is actually configured (see the roadmap in issue #7).

## Free-tier / architecture guardrails

- No D1, KV, R2, Durable Objects, Queues, Workers AI, or other paid Cloudflare
  bindings are used in the MVP.
- The Worker script only handles `/api/health`; all other routes are served
  as static assets or the SPA shell, so most traffic never invokes the
  Worker's `fetch` handler.
- No user accounts, no login, and no server-side storage of lookup input.

## Privacy

Eiwa does not send lookup text to any server-side endpoint. The only Worker
route, `/api/health`, ignores request bodies entirely. AI inference (when
enabled) runs locally in your browser via WebLLM; nothing about your queries
leaves your device. See `docs/privacy.md` (added as the AI features land) for
details.

## License

Code is licensed under [AGPL-3.0](./LICENSE). Bundled dictionary data will
carry its own source-specific license and attribution, documented in-app and
in `docs/` as the dictionary pipeline lands.
