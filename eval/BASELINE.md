# Lookup-quality baseline — v1

Actual local run on 2026-11-07 (UTC), before Phase A (#103). Expectations were
independently curated before observing the results; no Eijiro/site data was
fetched. See [README.md](./README.md) for metric definitions and limitations.

## Reproduce

```bash
DICT_SOURCE=jmdict pnpm run dict:build
pnpm run dict:validate
pnpm run eval:lookup
```

The build used the verified, already-present `.cache/jmdict/` archive. The
benchmark itself only reads local built assets and calls `src/dict.ts`.

- Runner/lookup revision: `4430bb3b6a58fc598232a87c1ae8e15df7fdfabe`
- Base main revision: `14c014891ee4bd9970d5b82368d5c4e22e31ef5f`
- Unchanged `src/dict.ts` Git blob: `523b3a6c5c17c4aafdcc05a396acf31513da0d5a`
- Node `24.22.2`, pnpm `11.8.0`
- Query set: `eval/queries.jsonl`, v1, **100 queries**; 20 per category,
  each split 10 EN→JA / 10 JA→EN (50 per direction overall)
- Query SHA-256: `e14059822c20bfada52b05b5af4e930e9e2967891a580a2038346081e2cc0849`
- JMdict_e version: `2026-11-07`
- Source URL (build-time only): `https://www.edrdg.org/pub/Nihongo/JMdict_e.gz`
- Source archive SHA-256: `490d2fef9cd8dfcdfcd618863c827fe2efd52992b002fb502679d4e1b7fb039d`
- Manifest SHA-256: `c51c990a972ecad21338140570aed254dc2bddc890432b112e25b9557a0e43db`
- Manifest built at: `2026-11-07T14:59:53.211Z`
- Build: 219,036 source entries; 325,306 JA variants; 159,238 EN index entries;
  6,844 shards. Validation: 734,491 indexed entries including reading aliases,
  largest shard 1,031,866 bytes.

Rebuilding changes the manifest timestamp/hash even with the same pinned data.
Compare the source/query hashes and scoring revision, not just manifest hashes.

## Results

Counts and percentages below are copied from the command's real output. Every
rate uses that row's query count as denominator. Exact coverage and first-result
usefulness are independent, so these columns do not sum to 100%.

| Group                 | Exact hit      | Top-1 useful   | Miss           |
| --------------------- | -------------- | -------------- | -------------- |
| Overall               | 57/100 (57.0%) | 36/100 (36.0%) | 40/100 (40.0%) |
| single-word           | 20/20 (100.0%) | 12/20 (60.0%)  | 0/20 (0.0%)    |
| inflected-form        | 5/20 (25.0%)   | 1/20 (5.0%)    | 15/20 (75.0%)  |
| phrase-idiom          | 15/20 (75.0%)  | 8/20 (40.0%)   | 5/20 (25.0%)   |
| ambiguous-common      | 17/20 (85.0%)  | 15/20 (75.0%)  | 0/20 (0.0%)    |
| sentence-short-phrase | 0/20 (0.0%)    | 0/20 (0.0%)    | 20/20 (100.0%) |
| en-ja                 | 30/50 (60.0%)  | 13/50 (26.0%)  | 20/50 (40.0%)  |
| ja-en                 | 27/50 (54.0%)  | 23/50 (46.0%)  | 20/50 (40.0%)  |

## Reading the baseline

- Literal coverage is not relevance: `本` first returns `origin`, not `book`;
  `かみ` first returns `加味 → seasoning`, not an accepted common homophone.
- Inflected Japanese inputs all miss. English `running` is already a literal
  indexed headword; its success does not demonstrate lemmatization.
- All 20 sentence/short-phrase inputs miss. No AI fallback is scored or invoked.
- The strict curated proxy has known false negatives: `by the way → 所で` is an
  orthographic variant outside the expected list; `あめ → (hard) candy` is useful
  but has a leading qualifier rather than an accepted trailing one. Other valid
  synonyms can also fail. Expectations were not expanded after seeing these
  results. These are reproducible diagnostic scores, not a claim that every
  failed top-1 is wrong or that Eijiro was measured directly.

## Verification

- `pnpm run check`: **passed**, typecheck + lint + 133 tests in 20 files.
  Biome emits a pre-existing, informational schema-version notice (not a failure).
- `DICT_SOURCE=jmdict pnpm run dict:build`: **passed**, using the cached pin.
- `pnpm run dict:validate`: **passed** (real JMdict assets).
- `pnpm run eval:lookup`: **passed**, end-to-end offline with the results above.
- Fixture-based e2e was not required/run locally: no shared lookup/UI code or
  CI configuration changed. Unit coverage includes the real `src/dict.ts` path
  fed by temporary local assets, missing/invalid assets, remote-URL rejection,
  fixture-source rejection, input validation, first-result scoring and counts.

VM-only setup: `~/.local/bin` was added to `PATH`; pnpm's automatic pre-script
install hit an existing root-owned `node_modules` chown error, so checks used
`pnpm_config_verify_deps_before_run=false` with the already-installed locked
dependencies. No dependency, lockfile or repository configuration was changed.
