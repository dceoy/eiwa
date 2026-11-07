# Phase D: learning features (#106)

Implementation base: main `cab0c780edd68710765e4f8cbbfed815c865af5e`.
Single PR, branch `feat/learning-features`; keep draft, do not merge.

## Plan

- This base has no favourites or history code/storage keys (despite the roadmap's
  description). Add a local wordbook storing immutable dictionary-only result
  snapshots, direction, save time and order. Reopen without a lookup; export and
  validated, size-bounded JSON import merge without replacing existing snapshots.
  Report storage failures rather than claiming a save succeeded.
- Add opt-in local history, default off, with individual deletion and clear-all.
  Disabling history erases it. No AI output is persisted by the wordbook.
- Use dictionary headword indexes to resolve result text locally, not network
  search APIs. Only resolved headwords/terms/tokens get touch-friendly buttons;
  use each token's language, independent of the direction override.
- Extend the pinned Wiktextract streaming projection with one Commons recording
  per headword, preferring MP3, retaining file-description attribution. Only
  user-requested playback fetches audio; no self-hosting or background preload.
  TTS remains available, including after playback errors.
- Update privacy, fixture attribution, unit/e2e coverage. Run `pnpm run check`,
  fixture e2e, real-source production build/asset validation and unchanged
  `pnpm run eval:lookup` against `eval/PHASE-B.md`. Record actual coverage and
  browser spot checks (offline snapshot, gloss relookup, audio/fallback).

## Boundaries

No accounts, sync, scheduling, paid services, deployment, or audio redistribution.
Existing optional model downloads, external citation navigation, and OS TTS
privacy caveats remain. Commons streaming is an explicit user-initiated exception.
