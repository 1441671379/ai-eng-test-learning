"""Offline lexical IPA for display; word-specific accent paths for assessment.

Raw dictionary data and licenses live in data/ipa-dict. Do not mistake the
acoustic decoder's unstressed phone sequence for a learner's dictionary IPA.
No speech models or network requests are loaded here.
"""
from difflib import SequenceMatcher
from functools import lru_cache
from itertools import product
from pathlib import Path
import re

VERSION = "lexical-us-uk-v1"
DATA = Path(__file__).parent / "data" / "ipa-dict"
# Reviewed basic transcriptions; the open wordlist uses differing stress
# conventions. Preserve its other entries verbatim instead of inventing IPA.
REVIEWED = {"notice": {"US": ["/ˈnoʊtɪs/", "/ˈnoʊtəs/"], "UK": ["/ˈnəʊtɪs/"]}}
MULTI = sorted(["tʃ", "dʒ", "aɪ", "aʊ", "eɪ", "ɔɪ", "oʊ", "əʊ", "ɪə", "eə", "ʊə"], key=len, reverse=True)


@lru_cache(maxsize=2)
def _dictionary(accent):
    result = {}
    for line in (DATA / ("en_US.txt" if accent == "US" else "en_UK.txt")).read_text(encoding="utf-8").splitlines():
        word, _, ipa = line.partition("\t")
        result.setdefault(word.lower(), []).extend(re.findall(r"/[^/]+/", ipa))
    return result


def ipa_phones(ipa, accent):
    if "ɝ" in ipa or "ɚ" in ipa:
        result = []
        for piece in re.split("([ɝɚ])", ipa):
            result.extend(["ɜː", "ɹ"] if piece == "ɝ" else ["ə", "ɹ"] if piece == "ɚ" else ipa_phones(piece, accent))
        return result
    text = re.sub(r"[/ˈˌ.\s͜͡]", "", ipa).replace("g", "ɡ").replace("r", "ɹ").replace("ɫ", "l")
    result = []; i = 0
    while i < len(text):
        token = next((p for p in MULTI if text.startswith(p, i)), text[i]); i += len(token)
        if i < len(text) and text[i] == "ː": token += "ː"; i += 1
        # CMU-derived US dictionary omits the IPA length sign. Normalize its
        # notation only, without collapsing English /ɪ/ vs /iː/ or /ʊ/ vs /uː/.
        token = {"i": "iː", "u": "uː", "ɝ": "ɜː", "ɚ": "ə", "ɐ": "ə"}.get(token, token)
        if token == "ɑ" and accent == "US": token = "ɑː"
        if token == "ɔ" and accent == "US": token = "ɔː"
        result.append(token)
    return result


def _hybrids(a, b):
    """Independent local accent choices, not arbitrary global substitutions.

    Only corresponding blocks between *this word's* US and UK entries can
    mix. Every vowel/consonant remains constrained by those lexical entries.
    Bound expansion for unusually long names; retain both complete entries.
    """
    blocks = []
    for tag, i, j, k, l in SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        blocks.append([a[i:j]] if tag == "equal" else [a[i:j], b[k:l]])
    size = 1
    for block in blocks: size *= len(block)
    if size > 64: return [a, b]
    return [[p for block in choice for p in block] for choice in product(*blocks)]


@lru_cache(maxsize=8192)
def word_reference(word, fallback=(), british=()):
    key = word.lower().replace("’", "'")
    entries = []
    for accent in ("US", "UK"):
        values = REVIEWED.get(key, {}).get(accent) or _dictionary(accent).get(key, [])
        for ipa in dict.fromkeys(values):
            entries.append({"accent": accent, "ipa": ipa, "source": "reviewed-basic" if key in REVIEWED else "ipa-dict"})
    by_accent = {a: [ipa_phones(e["ipa"], a) for e in entries if e["accent"] == a] for a in ("US", "UK")}
    candidates = [list(fallback)] if fallback else []
    if british: candidates.append(list(british))
    candidates.extend(p for group in by_accent.values() for p in group)
    for us in by_accent["US"]:
        for uk in by_accent["UK"]: candidates.extend(_hybrids(us, uk))
    if fallback and british: candidates.extend(_hybrids(list(fallback), list(british)))
    variants = [list(p) for p in dict.fromkeys(tuple(p) for p in candidates if p)]
    return {"version": VERSION, "dictionary": entries, "variants": variants,
            "source": "lexicon-with-acoustic-fallback" if entries else "g2p-fallback",
            "mixedAccentsAllowed": True}
