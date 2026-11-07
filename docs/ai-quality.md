# Phase C: on-device AI quality

Refs #105. BYOK is excluded because owner approval has not been given. No
server-side inference or API calling was added. All generation uses on-device
WebLLM, with zero operator inference cost.

Base: `main` at `4f21e02e7106ed598946129154f9f922976c7c01`.
Single draft PR on `feat/ai-quality`; leave draft and do not merge.

## Implemented

1. Grounding includes up to three entries for the leading headword and three
   retained senses each, supplied readings, source labels, examples and IPA.
   Per-field caps and an 1800-byte UTF-8 ceiling bound context size. Navigational
   headwords are excluded. Missing/omitted facts remain unknown. AI schema and
   dictionary-only rendering/provenance are unchanged.
2. Completed JSON sections publish through the existing token stream: translation
   first, then nuance/correction/warnings. Dictionary baseline paints immediately.
   Late failures/cancellation preserve shown content, without error/miss banners.
   Cancellation settles the Worker before another generation starts.
3. Pro is explicit opt-in with a separate ~2000 MB download confirmation. Lite
   0.5B remains default on every device. Exact Pro model:
   `Qwen2.5-3B-Instruct-q4f16_1-MLC`. It exists in WebLLM **0.2.87**
   `node_modules/@mlc-ai/web-llm/lib/index.js` (model_id at line 2092), with
   `Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm` and 2504.76 MB estimated VRAM.
   `src/model-config.test.ts` checks all model IDs/libraries against the actual
   imported `prebuiltAppConfig`, not a copied list.
4. One-tap back-translation uses the same already-ready engine in the reverse
   direction, clearly labeled AI output. It never initializes/downloads a model;
   failures degrade quietly and cannot replace the original lookup.

## Verification

- Latest local `pnpm run check`: **212 tests**, typecheck and lint pass.
  Existing informational Biome schema-version notice remains unrelated.
- Fixture e2e: **56/56 passed** (mobile + desktop), including the real pinned,
  hash-verified WebLLM facade with only the Worker protocol stubbed. New cases
  verify staged display, back-translation, late failure and cancellation.
- Production `DICT_SOURCE=jmdict pnpm run build`: passed after increasing the
  timeout on the initial attempt. Validation: 7429 shards, 138 search indexes,
  largest shard 1,047,388 bytes; all 7588 dist assets under 5 MiB.
- `pnpm run eval:lookup`: before/after all **100 per-query diagnostics and every
  category/direction score identical**: exact-hit 61%, top-1 useful 50%, miss 21%.
  Dictionary code/data were not changed by Phase C.
- Production prompt spot-check: English `run` includes actual JMdict sense
  records (`run`, `to run`), IPA `/ɹʌn/; /ɹʊn/`, and the bilingual Tatoeba pair
  #1519/#4930. The existing reverse EN index only retains the first gloss, so
  broader polysemy cannot be claimed there. Japanese `走る` includes three distinct
  retained senses: `to run`; `to run (of a vehicle); to drive; to travel`;
  `to rush (to); to dash; to race`. Prompt tests also exercise three distinct
  supplied senses for `run` and adversarially large multilingual context.

### Environment limitation during final hardening

After the successful full browser/production/evaluation runs, a small final
hardening patch narrowed context to the leading headword, lowered its ceiling,
and ensured early stream-consumer exit waits for the Worker. The latest check
above includes that patch. The next browser re-run passed 53 tests (including all
new AI tests), then Chromium crashed and all regular-file writes started failing
with `EPERM`, even tiny writes under `/tmp`. Another re-run could not build its
fixtures. Consequently a final local production/evaluation re-run was blocked;
do not confuse the earlier successful runs with a final-head local run.

The final tested sources and browser fixtures were published through GitHub's
Git database API because even `git add` could not write. Local Git synchronization
remains pending filesystem recovery. Final-head CI evidence is recorded on the
PR separately.

**WebGPU inference cannot run in this VM.** Registry validity, prompts, staging,
schema handling, and UI/Worker integration were tested up to the engine boundary.
Real-device Pro download/generation, latency and translation quality remain
unverified. There is no BYOK, remote inference, or extra language scope.
