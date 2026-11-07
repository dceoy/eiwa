# Lookup-quality benchmark (v1)

Local/manual evaluation for #102, before search/ranking work in #103. No CI
job builds JMdict or runs this benchmark.

## Run

```bash
# One-time prerequisite; uses the pinned .cache/jmdict/ archive if present.
DICT_SOURCE=jmdict pnpm run dict:build
pnpm run eval:lookup
```

The benchmark reads the already-built `public/dict/` assets and refuses fixture
builds. It never downloads or rebuilds data. Once built, the evaluation is fully
offline: a filesystem-backed fetch adapter feeds the app's own
`src/dict.ts` lookup/cache/validation path. No server, browser or AI is involved.
An ordinary development/build command replaces JMdict with fixtures; rebuild
with `DICT_SOURCE=jmdict` before evaluating again.

## Curated expectations

`queries.jsonl` is the versioned v1 set: 100 hand-authored cases, 20 in each of
five categories, with 10 EN→JA and 10 JA→EN cases per category. Each line has a
stable `id`, `input`, `direction`, `category`, and nonempty `expected` list.
Each expectation pairs a dictionary `headword` (including a lemma for inflected
inputs) with acceptable first-translation `senses` in the target language.

These are independently authored expectations from language knowledge of what
a strong general bilingual dictionary should surface first, **not copied from,
scraped from, or verified against live Eijiro results**. Eijiro-class quality is
the aspiration, not a measured claim of parity. Expectations are fixed before
observing the baseline; don't relax them merely to improve a score. Ambiguous
cases explicitly accept several common senses, but not every possible sense.
Sentence cases test dictionary coverage, not AI translation quality.

## Metrics

All rates use the number of queries in that row as denominator:

- **Exact hit:** at least one returned headword equals the input under the app's
  `normalizeHeadword` rules. This measures literal headword coverage, not semantic
  correctness. A kana alias or inflection→lemma result can be useful without
  being an exact hit.
- **Top-1 usefulness:** the first returned entry has an expected headword AND
  its first translation matches one of that headword's acceptable senses.
  Headwords/translations use app normalization in their respective languages.
  An English translation may additionally have a trailing parenthetical
  qualifier, e.g. `water (esp. drinking water)` matches curated `water`;
  arbitrary substrings such as `water buffalo` do not match. Only the first
  translation counts, not a buried sense or later result.
- **Miss:** no entries returned. A wrong/unhelpful result is not a miss.

Exact hit and top-1 are independent, not complements; miss is disjoint from
both. Top-1 is a deliberately strict, reproducible proxy for usefulness, not
human judgment of every definition. Wording variants outside the curated list
can cause false negatives. This balanced diagnostic set is not a traffic sample.

The command prints counts and rates overall, by category and by direction,
followed by per-query diagnostics (including actual first headword/translation).
Errors in assets or query data fail the command rather than counting as misses;
low scores alone do not cause a nonzero exit code. Source versions, manifest
hash, query-file hash and lookup revision are printed for repeatability.

## Comparing changes

See `BASELINE.md` for the initial real-JMdict run. Use the same query-file hash,
source pin, and scoring rules when comparing lookup revisions; report percentage
point deltas, not just a new total. Curated changes need a version bump and a
new baseline, not silent edits to v1. Generated dictionary assets stay ignored.
