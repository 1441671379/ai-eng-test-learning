# Pronunciation wordlists

Vendored unchanged from https://github.com/open-dict-data/ipa-dict at
43c3570eb3553bdd19fccd2bd0091534889af023 on 2026-10-17.
File sizes and SHA-256 hashes are in source.json. Runtime is offline.

- en_US.txt: General American, 125,927 entries; ipa-dict's modified
  cmudict-ipa data. Preserve LICENSE-cmudict-ipa-MIT.txt and upstream credits.
- en_UK.txt: British RP, 65,119 entries; derived from leoboiko/ipacards.
  **GPL-3.0 data**, not MIT. Preserve LICENSE-ipacards-GPL-3.0.txt, this
  attribution, and the editable text dataset when redistributing.
- LICENSE and README.md are ipa-dict's original repository notices. Its MIT
  notice does not override third-party licenses listed in its Credits section.

These are open pronunciation wordlists, not a complete authoritative learner
dictionary. UK stress placement and some vowel notation follow the original
source's conventions. The application preserves originals, labels unknown
words as automatic fallback, and keeps reviewed display corrections separately
in pronunciation_reference.py. The notice basic entries were reviewed against
https://dictionary.cambridge.org/us/pronunciation/english/notice .

Display preserves stress marks. Assessment currently removes stress and uses
word-specific US/UK pronunciations, independent local accent alternatives,
G2P fallback, and context-limited allophones. It does not assess lexical stress
or resolve the grammatical meaning of heteronyms. A final distribution must
include the data's licenses and corresponding sources, or replace that data
with appropriately licensed lexicons; do not label all bundled data MIT.
