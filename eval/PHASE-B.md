# Phase B data depth — issue #104

Measured 2026-11-07 UTC; no AI, live Eijiro requests or benchmark changes.
Runtime/data revision: `e0482e3ee6f36105d634865ddd681f454c86de43` (final
report/test-locator/documentation commits do not change the data or runtime).
Branch `feat/data-depth`, draft PR <https://github.com/dceoy/eiwa/pull/110>,
base `feat/search-and-ranking`, frozen implementation base
`83271a1c0bc3c30eb3fab424a056becacc67ca77`. This is a branch-based stack,
not native GitHub stack metadata. #109 originally stacked on #108; during this
work its branch advanced to `6f05a3d0f7adf72ea46886e4a7215d37c8398a10` via
merge/CI-only commits. Its tree is identical to the frozen base. This task
never commits/pushes to either parent branch or main, retargets, merges or marks ready.

## Reproduce

```bash
pnpm run check
pnpm run test:e2e # fixtures, no source downloads
DICT_SOURCE=jmdict pnpm run build
pnpm run dict:validate
pnpm run dict:spotcheck
pnpm exec tsx scripts/check-depth-lookups.ts
pnpm run eval:lookup
```

Preserve verified `.cache/jmdict/`, `.cache/frequency/` and `.cache/depth/`:
rotating source endpoints deliberately fail closed after upstream changes.
Source/tooling/caps/license details: [`docs/data-depth.md`](../docs/data-depth.md).

## Exact source pins

JMdict and FrequencyWords are unchanged from `PHASE-A.md`. New pins:

| Artifact                    | Version/date                                                         | Download bytes | SHA-256                                                            |
| --------------------------- | -------------------------------------------------------------------- | -------------: | ------------------------------------------------------------------ |
| Tatoeba EN detailed TSV bz2 | 2026-11-07                                                           |     34,983,679 | `afec98e4c44a72f8fc709ce4d672fd3ab7f9ca731402f5d35e384b0b21b207c5` |
| Tatoeba JA detailed TSV bz2 | 2026-11-07                                                           |      4,462,852 | `14e7b047fca3721291bc16c4e9a3b5f967ebdb9b34f704aff9a8b50d0d1d1501` |
| Tatoeba links tar.bz2       | 2026-11-07                                                           |    150,515,693 | `c8ed4ce074b8a07538c8ca464e97975c61ee379636e45dbc5c464b2943493ab6` |
| Kaikki English JSONL gzip   | extracted 2026-10-30 / enwiktionary 2026-10-01 / Wiktextract 19f9a30 |    534,186,395 | `4d03b6cba283744756c57ff661c2c6cbfe34fcf8ff513a966576cf7d97e91a99` |
| NGSL ranked CSV             | 1.2, April 2023                                                      |         62,566 | `2098bab8955a120a9766c6282a51d7d578c6cb0a7d946600d2ffb73ba25a0b44` |

All sizes were checked by HEAD before downloading. Every complete artifact was
SHA-256 verified; caches are reverified on every build. Exact URLs, dates and
hashes are in `scripts/depth-sources.ts` and manifest `sourceVersions`; all
license/attribution/adaptation notes are in manifest `licenses` and the UI.

## Real-source results

Counts below deduplicate reading aliases and entry IDs unless explicitly noted.
Words mean normalized existing headwords, not all words in the source dump.

| Source                                          | Retained coverage                                                                                                                                          | Added serialized entry bytes |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------: |
| Tatoeba (CC BY 2.0 FR)                          | **23,778 unique bilingual pairs**, **53,378 headword/pair associations**, 10,951 EN + 14,943 JA headwords                                                  |       50,202,616 (47.88 MiB) |
| Wiktextract / English Wiktionary (CC BY-SA 4.0) | **20,927 words with IPA**, **28,020 with etymology**; 14,020 derived / 8,655 related; 38,423 lemmas with 64,891 unique attested lemma/form pairs           |       60,966,967 (58.14 MiB) |
| NGSL 1.2 (CC BY-SA 4.0)                         | All **2,809** ranked source rows parsed; **2,563** occur in the EN index (949 basic, 1,614 intermediate); 26,011 outside-list single words tagged advanced |       25,917,610 (24.72 MiB) |

Per-source byte columns are marginal UTF-8 JSON bytes for fields **and source
attribution**, including repeated entries and reading aliases. They are not
compressed download sizes. Manifest/search-index/split-reference growth is
included in the overall delta below, not assigned to a source column.

- Tatoeba streamed **167,557 eligible direct EN→JA links** (owned, length-bounded
  sentences); retained pairs support both lookup directions. 112,419 pair/entry
  assignments before reading aliases. Budget accounting: EN 25,165,736 + JA
  25,165,822 bytes, each ≤24 MiB, including attribution and alias multiplicity.
  Every word has at most three pairs; nothing is represented as sense-aligned.
- Wiktextract streamed **1,499,161 JSONL records** from the complete English gzip,
  keeping bounded projections only. No whole multi-GB JSONL read or extracted
  temp file. 142,353 source-form/entry assignments before reading aliases;
  final EN lemma index has 102,207 form rows including Phase A's fallback rules.
- NGSL's `I`, `TRUE`, `FALSE` rows are case-folded correctly. No phrase tags,
  no CEFR/SVL claim, no ranking changes. Outside-list advanced is only an Eiwa
  coarse membership band, not a difficulty guarantee.

## Production size/resource validation

- Manifest built at `2026-11-07T16:06:42.816Z`, SHA-256
  `55a6ebf033e129c6b2d9e7272f0211315ecf41c0840e7de10cf53afe4c973ef6`.
- **7,309 entry shards + 138 search indexes + manifest = 7,448 dictionary files**;
  **7,468 total dist files** (Phase A: 7,029, delta +439).
- **484,544 entries**, 734,491 indexed entries including reading aliases.
- **Largest shard: 1,045,511 bytes**, below 1 MiB (1,048,576).
- **Total dictionary: 562,803,448 bytes (536.73 MiB)** including manifest/indexes.
  Phase A local artifact: 424,490,279 bytes. **Added: 138,313,169 bytes
  (131.91 MiB)**. Total dist: 563,256,444 bytes (537.16 MiB).
- Final full production build passed `dict:validate`, TypeScript, Vite/PWA and
  the dist-wide file-count / 5 MiB-per-file checks. Validation was rerun after
  restoring production artifacts following the final fixture e2e run.
- Full build elapsed **281.14 seconds**, maximum child-process RSS
  **1,514,444 KiB (~1.44 GiB)** via Linux `getrusage(RUSAGE_CHILDREN)`; not a sum
  of all concurrent processes. Comfortable under this VM's ~7.7 GiB RAM.
- pnpm 11.8.0, scripts' pnpm-managed Node **26.12.1** (shell wrapper Node
  24.22.2), existing locked dependencies, `tar`/`bzip2`; no new installs.
  `~/.local/bin` on PATH, `pnpm_config_verify_deps_before_run=false` for the
  existing root-owned dependency-verification workaround.

## Verification and app-path spot checks

- `pnpm run check`: passed, **164 tests / 24 files**; typecheck and lint pass.
  Only the pre-existing informational Biome schema-version notice remains.
- Fixture e2e: **40 passed**, mobile + desktop, final code/test locators.
  Two tiny explicitly licensed fixture excerpts cover both directions;
  CI downloads no production sources. Fixture licensing is documented in
  `fixtures/dict/README.md`.
- Production browser checks: **6 passed**, the same three depth tests on mobile
  and desktop, served from the actual production `dist` using Vite preview.
  `run` visibly shows IPA, etymology, the basic tag and sourced EN/JA examples;
  電車 and でんしゃ show the Japanese-side pair and both contributors.
  The run test observes **no automatic external requests**.
- Offline checks through `src/dict.ts` and `mergeResult` passed for `run`,
  電車, でんしゃ, `ran → run`, all source licenses and existing Phase A checks.
  `run`: `/ɹʌn/; /ɹʊn/`, basic, 600-character etymology, 8 derived / 8 related
  terms, 3 attested forms. Its first pair is #1519 **CK**, “Someday I'll run like
  the wind.” ↔ #4930 **bunbuku**, “またいつか風のように走るんだ。”
  電車's first pair is #1575 **mrtaistoi**, “Don't open before the train stops.”
  ↔ #4979 **bunbuku**, “電車が停まるまで開けないで。”
- The optional production browser harness initially needed the correct project
  working directory, then exposed fixture-only locator assumptions (multiple
  example sections) and a 5-second cold-lookup wait. Assertions are now scoped
  to the exact headword and wait up to 20 seconds. Final runs pass; observed
  cold JA tests take ~5–6 seconds on this VM because Phase A still reads the
  related-search tables. This mobile first-use cost is **not** claimed fixed.

## Unchanged 100-query lookup evaluation

Query SHA-256: `e14059822c20bfada52b05b5af4e930e9e2967891a580a2038346081e2cc0849`.
Every group is **identical** to `PHASE-A.md`: all three metric deltas are **0 pp**.

| Group                 | Exact hit    | Top-1 useful | Miss         |
| --------------------- | ------------ | ------------ | ------------ |
| Overall               | 61/100 (61%) | 50/100 (50%) | 21/100 (21%) |
| single-word           | 20/20 (100%) | 14/20 (70%)  | 0/20 (0%)    |
| inflected-form        | 5/20 (25%)   | 12/20 (60%)  | 0/20 (0%)    |
| phrase-idiom          | 19/20 (95%)  | 8/20 (40%)   | 1/20 (5%)    |
| ambiguous-common      | 17/20 (85%)  | 16/20 (80%)  | 0/20 (0%)    |
| sentence-short-phrase | 0/20 (0%)    | 0/20 (0%)    | 20/20 (100%) |
| en-ja                 | 34/50 (68%)  | 15/50 (30%)  | 11/50 (22%)  |
| ja-en                 | 27/50 (54%)  | 35/50 (70%)  | 10/50 (20%)  |

No regression, but no measured ranking improvement: this adds facts to the
existing index and morphology coverage outside the curated query set, not new
translation headwords, semantic ranking or sentence translation. The old
primary-gloss coverage/ranking limitations remain. Lexical summaries are now
restricted to the leading headword so unrelated prefix/substring results cannot
lend it an incorrect etymology, IPA or derived-word list.

## Scope and caveats

**No sub-source was scoped out for size/tooling reasons.** Language-specific
Tatoeba exports and Kaikki's English-only compressed artifact cover the task
without all-language downloads. Deliberate mobile projections remain: limited
sentences/forms/terms, unowned/long sentences omitted, lightweight segmentation,
no sense/POS/dialect alignment, and no separate NGSL unranked supplement.
Kaikki labels this postprocessed format deprecated; verified caches are needed
for repeat builds and any future format migration must be deliberate.
No audio, AI facts, new packages, paid bindings or deployment configuration.
PR remains **draft**, `Refs #104`, awaiting Muse's stack handling, not review.
