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

## Implementation and verification

Runtime/test revision: `0f8b3b7a22d7fb79d0cf56006d0659c56040537c`.
Draft PR: <https://github.com/dceoy/eiwa/pull/111>. Never marked ready or merged.

- Wordbook: complete dictionary-only snapshots, immutable across upstream
  changes, reopening without lookup; direction, first sense and save time in
  list; delete, accessible up/down ordering, JSON export/validated merge import.
  Up to 200 entries / 4 MiB; existing snapshots win on duplicate import.
  Invalid/unsafe links and oversized files are rejected. Storage failures are
  visible and never falsely report a successful save.
- Relookup: exact dictionary headwords, gloss/translation terms and example
  tokens; no fuzzy token links. Up to four marked tokens per text, common EN
  function words skipped. Dotted underline, 44px touch target, keyboard buttons.
  Token language wins over the direction override. AI text is not linkified.
  Phrase terms resolve when the whole field is indexed; no substring linking.
- Audio: pinned Wiktextract ingestion streamed all **1,499,161 records**;
  **147,476 sound records** have audio, MP3 and Ogg URLs. Retained **24,579
  normalized English headwords with Commons recordings**. One URL per word,
  MP3 preferred even across rows, Commons-only HTTPS media validation. Source
  file-page credits/license link, no audio bytes redistributed. No media src
  until Play, no preload, anonymous CORS, pause on unmount; TTS remains available
  after failure. No change to the Phase B source pins.
- History: explicit opt-in, default OFF, max 50 queries/directions, individual
  delete, clear-all and erase-on-disable; snapshot reopening adds no history.
  Privacy and README now describe these stores and the Commons hotlink exception.

### Checks

- `pnpm run check`: **189 tests / 28 files passed**, typecheck/lint passed.
  Pre-existing informational Biome schema-version notice only.
- Final fixture `pnpm run test:e2e`: **50 passed**, mobile + desktop, including
  wordbook CRUD/reorder/export/import, offline reopen after reload with blocked
  dictionary requests, gloss/example relookup with cross-language override,
  history deletion/default-off, no auto media request/no referrer, intercepted
  PCM media decoding/playback, and absent/failed recording TTS fallback.
- Initial real-source `DICT_SOURCE=jmdict pnpm run build` at `8e31779`:
  **passed**, all 7,588 dist files below 5 MiB; 7,429 entry shards + 138 search
  indexes, largest shard **1,047,388 bytes < 1 MiB**, dictionary total
  **583,438,594 bytes**. Audio adds 20,635,146 bytes vs Phase B (source metadata
  wording and shard/manifest overhead included). Generated files not committed.
- Final production rebuild at `0f8b3b7`: ingestion and dictionary validation
  passed with the same counts/sizes, but Vite/workbox failed with filesystem
  `EPERM: operation not permitted, write`. Subsequent minimal Node **and Python**
  regular-file write probes failed in `/tmp` and `dist` as well. This is an
  environment write failure, not a passing final production build. Current
  `public/dict` is complete; `dist` is incomplete after that failed rebuild.
  Repeat the production build when workspace writes are available again.
- Production browser checks on the earlier complete production dist: **4 passed**
  (mobile + desktop): save/reload/offline reopen with identical dictionary text,
  gloss relookup, and Commons recording decode/playback (0.541315s duration).
  Direct Chromium playback was blocked by this VM's authenticated egress tunnel
  (`ERR_TUNNEL_CONNECTION_FAILED`); curl got HTTP 200 audio/mpeg. The successful
  browser check used a **test-only curl transport bridge** on the Commons URL
  after Play, with real Commons bytes and no referrer. No such proxy exists in
  app code. Direct browser-to-Commons playback remains unverified on this VM.
- `pnpm run eval:lookup` rerun on final production dictionary at `0f8b3b7`:
  **identical to `eval/PHASE-B.md` in every group**, all deltas 0 pp. Overall
  exact **61/100**, top-1 useful **50/100**, miss **21/100**. Query SHA-256
  `e14059822c20bfada52b05b5af4e930e9e2967891a580a2038346081e2cc0849`.
  Final manifest SHA-256
  `c49790168983bcf04fdd4107f929b29afb4e6d0fa1a573767bdfeabd9dddd2a6`,
  built `2026-11-07T17:06:06.601Z`.
- GitHub checks on `0f8b3b7`: check, e2e, CodeQL (both analyses and security
  gate), Workers Builds all passed. An initial test-only URL regex warning was
  fixed by asserting the exact Commons file URL, not suppressing the rule.

### Remaining scope / caveats

No feature sub-source was dropped. No migration from favourites/history was
needed because this base has no such implementation or storage keys. The
wordbook deliberately does not save AI explanations or audio files. Accounts,
sync and spaced repetition remain non-goals. Saved dictionaries survive cache
clearing but not site-storage clearing/eviction; export backups explicitly.
The outstanding verification limits are the final local production build's
filesystem write failure and direct browser Commons transport on this VM.
PR stays **draft**, `Refs #106`, with no review request or merge.
