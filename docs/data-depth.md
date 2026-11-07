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

| Official artifact | Compressed bytes |
| --- | ---: |
| Tatoeba all-language detailed sentences (not selected) | 304,389,185 |
| Tatoeba EN detailed TSV | 34,983,679 |
| Tatoeba JA detailed TSV | 4,462,852 |
| Tatoeba links tar.bz2 | 150,515,693 |
| Kaikki English JSONL gzip | 534,186,395 |
| NGSL 1.2 ranked CSV | 62,566 |

VM: ~7.7 GiB RAM, 144 GiB free disk. Use the language-specific Tatoeba
artifacts instead of all languages; the English-only Kaikki gzip is feasible.
Never read the entire JSONL into memory. Preserve verified caches in `.cache/`.

Implementation details, exact pins/caps, licensing and measured verification
results follow in subsequent commits.
