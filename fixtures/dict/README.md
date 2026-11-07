# Offline dictionary fixtures

Definitions/translations are hand-authored CC0 test data, not a production
dictionary. Two small, deliberately curated licensed excerpts exercise the
Phase B UI without any CI downloads:

- `en.json`, **run**: Tatoeba sentences #1519 by **CK** and #4930 by
  **bunbuku**, unchanged from the pinned 2026-11-07 detailed exports/links.
- `ja.json`, **電車**: Tatoeba #1575 by **mrtaistoi**, #4979 by **bunbuku**,
  unchanged from the same exports. Both pairs are **CC BY 2.0 FR**:
  <https://creativecommons.org/licenses/by/2.0/fr/>. Sentence/profile links
  and contributor names are rendered with each pair, per Tatoeba's terms:
  <https://tatoeba.org/en/terms_of_use>.
- **run** IPA, trimmed etymology and three forms are an excerpt from English
  Wiktionary via Kaikki/Wiktextract's pinned 2026-10-30 extraction,
  **CC BY-SA 4.0**. Original article/contributors:
  <https://en.wiktionary.org/wiki/run#English>.
- **run**'s basic tag is derived from NGSL 1.2's first 1,000 ranked words,
  **CC BY-SA 4.0**, by Browne, C., Culligan, B., and Phillips, J. This is an
  Eiwa coarse band, not CEFR/SVL.

ShareAlike license: <https://creativecommons.org/licenses/by-sa/4.0/>.
Exact artifact pins and the adaptation policy are in
[`scripts/depth-sources.ts`](../../scripts/depth-sources.ts) and
[`docs/data-depth.md`](../../docs/data-depth.md). These tiny fixture excerpts
are not generated production shards or a committed source dump.
