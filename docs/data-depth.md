# Phase B data depth (#104)

Work branch: `feat/data-depth`, stacked on PR #109 (`feat/search-and-ranking`)
at `83271a1c0bc3c30eb3fab424a056becacc67ca77`; #109 is stacked on #108.
One branch-based PR; do not merge or mark ready during this task.

## Implementation plan

Reuse the dictionary shard writer, checksum manifest, validator and on-demand
lookup. Build-time enrichment only; fixture builds remain offline and the CI
default. No AI facts, paid bindings, runtime external requests or audio.

- Tatoeba: official EN/JA detailed sentence exports (retain sentence IDs and
  contributor names) plus links, pinned by export date and downloaded SHA-256.
  Token/headword indexed, bounded examples, full sentence attribution.
- Wiktextract: stream the official Kaikki English-only compressed JSONL; filter
  to existing EN headwords and form-of links targeting those headwords. Bounded
  IPA, etymology, related/derived terms and forms; feed the Phase A lemma index.
- NGSL 1.2: official ranked CSV, pinned by hash; coarse derived level tags.
- Validate fixtures/unit/e2e, then production build/asset limits, lookup-path
  spot checks and unchanged 100-query evaluation against `eval/PHASE-A.md`.

## Resource preflight

HEAD requests on 2026-11-07, before downloads:

| Official artifact                                      | Compressed bytes |
| ------------------------------------------------------ | ---------------: |
| Tatoeba all-language detailed sentences (not selected) |      304,389,185 |
| Tatoeba EN detailed TSV                                |       34,983,679 |
| Tatoeba JA detailed TSV                                |        4,462,852 |
| Tatoeba links tar.bz2                                  |      150,515,693 |
| Kaikki English JSONL gzip                              |      534,186,395 |
| NGSL 1.2 ranked CSV                                    |           62,566 |

VM: ~7.7 GiB RAM, 144 GiB free disk. Use the language-specific Tatoeba
artifacts instead of all languages; the English-only Kaikki gzip is feasible.
Never read the entire JSONL into memory. Preserve verified caches in `.cache/`.

## Build and resource discipline

`DICT_SOURCE=jmdict pnpm run build` includes every source. `bzip2` and `tar`
must be available for Tatoeba; Node's gunzip/readline streams Kaikki one JSON
record at a time. No full JSONL buffer, DOM, or extracted multi-GB temp file.
Only the EN index set and bounded projections are retained. Tatoeba retains
bounded-length EN/JA sentence maps, streams all links and retains capped pairs.
There are no new packages. Fixtures/CI never invoke download/enrichment code.

`scripts/depth-sources.ts` is the source-pin inventory: exact URL, version/date,
compressed byte length and SHA-256 for **all five** artifacts, copied into
manifest `sourceVersions`. Cache files under `.cache/depth/` are SHA-256 verified
on every build. A fresh download requires matching HEAD size, streams to `.part`,
verifies hash and atomically renames. Changed upstream content fails closed;
preserve verified caches externally or deliberately update pins after inspecting
the new release, then rerun all checks. These are rotating upstream URLs, not
promises of permanent historical hosting. Generated output is never committed.

Kaikki's official English-only gzip is selected instead of the larger raw
all-language enwiktionary dump. This is its postprocessed English dictionary
(extracted 2026-10-30 from the 2026-10-01 dump, Wiktextract `19f9a30`,
wikitextprocessor `6f96ddf`). The site marks this format deprecated; preserve
the cache, and review a future migration explicitly rather than silently
switching artifacts. The complete selected gzip is downloaded and streamed,
not range-sampled. No source was dropped for resource reasons.

## Mobile caps and indexing

- Examples: **3 pairs per normalized headword**, EN sentences ≤240 characters,
  JA ≤120; unowned sentences (`\\N`) are excluded because contributor attribution
  cannot be recovered from these exports. Text is unchanged, never truncated.
- **24 MiB per language / 48 MiB total** budget for serialized examples plus
  their source attribution, accounting for multiple entries and JA reading-alias
  duplication. First eligible direct links in export order fill each bucket;
  no transitive links. Existing EN word tokens and 2–4 word phrases, JA word
  segments and up-to-four-segment compound spans are matched, not arbitrary
  substrings. ICU segmentation is a lightweight compromise, not a morphological
  analyzer; coverage is incomplete. No sentence search or example-based ranking.
- Pairs are attached to existing entries at build time. These are **headword-level
  corpus examples, not sense-aligned translations**; the UI says so. Every
  returned entry has up to three and may collapse its example list. English
  and Japanese lookups (including reading aliases) use the same bilingual text.
- Wiktextract: **2 IPA variants** (each ≤100 characters), **600 characters** of
  whitespace-normalized etymology (ellipsis marks trimming), **8 derived + 8
  related terms**, **24 forms**, each term/form ≤64 characters. First available
  headword data in source order is used; dialect labels and POS/etymology
  distinctions are not retained. Data is headword-level, not matched to a
  particular JMdict sense. Audio, definitions, quotations, and translations
  from Wiktionary are not copied. Inflected records contribute only attested
  `form_of` links targeting existing EN lemmas; never copy their IPA onto a lemma.
  Table markers, alternative/archaic/obsolete/nonstandard forms are excluded
  where the format tags them. Generated Phase A forms remain a fallback.
- NGSL: all 2,809 ranked entries of official **1.2 (April 2023)**, case-folded;
  basic = rank ≤1000, intermediate = other ranked words, advanced = outside
  this ranked list. Only English single-word headwords are tagged. These are
  Eiwa's coarse inverse-frequency/membership bands, **not CEFR, SVL, or a claim
  that every outside-list word is difficult**. Separate unranked supplements
  are not included. NGSL levels do not affect ranking.
- The existing headword shard splitter remains authoritative: ≤1 MiB files,
  checksum/count/routing validation, on-demand fetching and content-addressed
  caching. Examples need no separate runtime index or monolithic payload.
  Validation also checks pair IDs/author/text bounds, Tatoeba licensing,
  lexical caps and level enums. Related search still loads the Phase A
  headword tables; it does not preload all enriched entries.

## Attribution and redistribution

Tatoeba's [terms §6.2/§6.5](https://tatoeba.org/en/terms_of_use) specify
**Creative Commons Attribution 2.0 France (CC BY 2.0 FR)** and require citing
sentence authors, not just Tatoeba. Eiwa retains and displays each sentence's
exported contributor username and sentence ID, with links to the contributor
profile and original sentence. Both sides of every pair are credited. Every
pair carries the license label, and the Sources panels link to
<https://creativecommons.org/licenses/by/2.0/fr/> and Tatoeba's terms.
Sentences are unchanged; selecting/indexing pairs is identified as Eiwa's work.

English Wiktionary contributors are credited via **Kaikki / Wiktextract,
Tatu Ylonen**, under **CC BY-SA 4.0**. Each enriched entry links to its original
English Wiktionary article (including contributor history via that page), and
the manifest links Kaikki's English dictionary. Sources record that etymologies
are trimmed and terms/forms capped. License:
<https://creativecommons.org/licenses/by-sa/4.0/>. The selected derivative
lexical data remains CC BY-SA 4.0. No source quotations or audio are reused.

**New General Service List 1.2 by Browne, C., Culligan, B., and Phillips, J.** is
credited under **CC BY-SA 4.0**, as stated on the official list page. Eiwa's
derived band rule is disclosed in the manifest and Sources panel; derived
level data remains CC BY-SA 4.0. These data licenses are separate from Eiwa's
AGPL code license and the synthetic CC0 fixture text.

## Verification

Measured results are recorded in `eval/PHASE-B.md` after the final build.
Spot checks: `pnpm exec tsx scripts/check-depth-lookups.ts`; lookup quality:
`pnpm run eval:lookup`. Both use the app's actual local dictionary lookup path,
not a substitute search implementation or live upstream calls.
