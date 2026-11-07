# Phase A lookup quality — issue #103

Measured on 2026-11-07 UTC using the **unchanged** 100-query v1 benchmark.
`BASELINE.md` remains the pre-Phase-A record. This measures the app's dictionary
path, not AI or live Eijiro responses. No expectations were modified.

## Reproduce

```bash
pnpm run check
pnpm run test:e2e # defaults to fixtures, no production downloads
DICT_SOURCE=jmdict pnpm run build
pnpm run dict:spotcheck
pnpm run eval:lookup
```

- Lookup/build revision: `e1d9ae2bdfe1583170ad83ce8ffb7f6d62ce2f82`.
- Stacked base: `feat/lookup-quality-benchmark` at
  `bbd6bb68059a22c519c23b133321760bccc48c8a` (#108, unmerged).
- Query SHA-256: `e14059822c20bfada52b05b5af4e930e9e2967891a580a2038346081e2cc0849`.
- JMdict version/hash unchanged from baseline: `2026-11-07`,
  `490d2fef9cd8dfcdfcd618863c827fe2efd52992b002fb502679d4e1b7fb039d`.
- FrequencyWords revision: `525f9b560de45753a5ea01069454e72e9aa541c6`;
  EN 2018 SHA-256 `5351ff405b1126ef555791dd4d9798a48e3e9a501a9fc481a9da957752cfb458`;
  JA 2016 SHA-256 `6f734851c4881295d66947e09987ccb17010bb71cd9df7b6e326870c847508d6`.
  Hermit Dave / OPUS OpenSubtitles, CC BY-SA 4.0, attributed in the manifest.
- Manifest built at `2026-11-07T15:33:44.417Z`, SHA-256
  `645ad5b2fe51d48071fe1f9ca1394b148d529a172a17cb816186864321c57e10`.
- Node `24.22.2`, pnpm `11.8.0`. Verified local source caches were reused.

## Results

Every rate uses the row's query count. Exact and top-1 are independent metrics.

| Group                 | Exact hit      | Top-1 useful   | Miss           |
| --------------------- | -------------- | -------------- | -------------- |
| Overall               | 61/100 (61.0%) | 50/100 (50.0%) | 21/100 (21.0%) |
| single-word           | 20/20 (100.0%) | 14/20 (70.0%)  | 0/20 (0.0%)    |
| inflected-form        | 5/20 (25.0%)   | 12/20 (60.0%)  | 0/20 (0.0%)    |
| phrase-idiom          | 19/20 (95.0%)  | 8/20 (40.0%)   | 1/20 (5.0%)    |
| ambiguous-common      | 17/20 (85.0%)  | 16/20 (80.0%)  | 0/20 (0.0%)    |
| sentence-short-phrase | 0/20 (0.0%)    | 0/20 (0.0%)    | 20/20 (100.0%) |
| en-ja                 | 34/50 (68.0%)  | 15/50 (30.0%)  | 11/50 (22.0%)  |
| ja-en                 | 27/50 (54.0%)  | 35/50 (70.0%)  | 10/50 (20.0%)  |

### Change versus BASELINE.md (percentage points)

| Group                 | Exact hit | Top-1 useful | Miss |
| --------------------- | --------- | ------------ | ---- |
| Overall               | +4        | +14          | -19  |
| single-word           | 0         | +10          | 0    |
| inflected-form        | 0         | +55          | -75  |
| phrase-idiom          | +20       | 0            | -20  |
| ambiguous-common      | 0         | +5           | 0    |
| sentence-short-phrase | 0         | 0            | 0    |
| en-ja                 | +8        | +4           | -18  |
| ja-en                 | 0         | +24          | -20  |

## Interpretation and limitations

- Inflected forms resolve to existing lemma entries, not synthetic definitions.
  All ten Japanese inflected queries now have useful top-1 lemma results; the
  English side has two useful top-1 results under the strict curated proxy.
  Existing literal headwords still precede lemma matches (`children`, `books`,
  etc.), but annotated lemma entries are included below them.
- The extra exact hits are from stripping the infinitive `to ` in the bounded
  primary-gloss EN index, not counting lemma/prefix/substring hits as exact.
- Miss means no returned dictionary entries, including related matches. A
  partial/prefix match can therefore reduce misses without being useful top-1.
  Spelling suggestions are **not** counted as hits or silently substituted.
- English reverse-index coverage is still restricted to the first literal gloss.
  Ranking cannot recover absent primary headwords; English top-1 remains weak
  (`dog → ドッグ`, `water → ウォーター`, `book → 書`). Published token counts do not
  measure sense relevance, and frequency can favor ambiguous spellings/loanwords.
  Authored JMdict sense order is preserved rather than sorting senses by token
  counts. No benchmark-specific ranking overrides were added.
- Phrase top-1 stays at 40%; all twenty sentence inputs still miss. This phase
  does not add full-text sentence analysis, translation, or secondary-gloss data.
- Morphology is an honest bounded subset: regular English forms plus a common
  irregular table and first-word phrase verbs; Japanese POS-backed common
  ichidan/godan/suru/kuru and i/na-adjective forms (including reading aliases).
  English exceptions and Japanese auxiliary/compound chains are incomplete.

## Validation and verification

- `pnpm run check`: passed, typecheck + lint + **152 tests / 23 files**.
  Only the pre-existing informational Biome schema-version notice remains.
- `pnpm run test:e2e`: passed, **34 tests**, mobile and desktop, fixture build.
  Includes prefix selection (EN/JA, keyboard), partial-match labels, all four
  requested irregular examples, and selecting a spelling suggestion.
- `DICT_SOURCE=jmdict pnpm run build`: passed, including dictionary validation,
  Vite/PWA and static asset limits (**7,029 dist files**, each below 5 MiB).
- Production validation: **6,874 entry shards + 134 search index files**;
  734,491 indexed entries including reading aliases; largest entry/index file
  **986,417 bytes**, largest search file **262,143 bytes**, all below 1 MiB.
  Search validation checks checksums, UTF-8 sizes, counts, sorted non-overlapping
  ranges, complete headword coverage and resolvable lemma targets.
- Headword tables: EN 113,320 rows / 2,649,960 bytes; JA 452,687 rows /
  10,414,960 bytes. Typing loads intersecting ranges only; explicit related
  search/spelling scans load these tables once per language into the cache,
  not all entry shards. This first-use transfer is a mobile limitation.
- `pnpm run dict:spotcheck`: passed on production assets:
  `moun` first suggests `mountain`; `took → take`, `went → go`, `better → good`,
  `children → child`, `食べた / たべた → 食べる` have inflection annotations;
  `mountan` first suggests `mountain`. Existing mountain/train/reading and
  manifest license checks also passed.
- `pnpm run eval:lookup`: passed offline through `src/dict.ts`, numbers above.

VM setup follows the baseline: `~/.local/bin` on PATH and
`pnpm_config_verify_deps_before_run=false` with already-installed locked deps,
working around the pre-existing root-owned dependency verification problem.
No package, lockfile, paid binding, AI, or deployment configuration was changed.
