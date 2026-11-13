"""Phone edit alignment with explicit word ownership, not audio time estimates.

Decoder confidence is a screening heuristic, not a pronunciation probability.
No new models or dependencies are needed for this alignment.
"""
from __future__ import annotations

from typing import Any

LOW_DECODER_CONFIDENCE = 0.60
EDIT_COST = 4
WEAK_WORDS = {
    "a", "an", "am", "and", "are", "as", "at", "can", "could", "do", "does",
    "for", "from", "had", "has", "have", "he", "her", "him", "his", "of", "or",
    "should", "some", "than", "that", "the", "them", "there", "to", "us", "was",
    "were", "would", "you", "your",
}
VOWELS = {"a", "ɑ", "ɑː", "ɐ", "æ", "ə", "ʌ", "ɛ", "ɜ", "ɜː", "ɪ", "i", "iː", "u", "uː", "ʊ", "ɔ", "ɔː", "ɒ"}


def canonical_phone(phone: str) -> str:
    return phone.replace("͡", "").replace("͜", "").replace("g", "ɡ").replace("r", "ɹ")


def phone_cost(expected: str, heard: str, word: str = "", previous: str = "", following: str = "") -> int:
    expected, heard = canonical_phone(expected), canonical_phone(heard)
    if expected == heard:
        return 0
    if {expected, heard} in ({"i", "iː"}, {"u", "uː"}, {"ɑ", "ɑː"}, {"ɔ", "ɔː"}, {"l", "ɫ"}):
        return 1  # English notation/allophone alternatives; never /ɪ/~/iː/.
    vowel_initials = "aeiouɑɐæəʌɛɜɪʊɔɒɚ"
    if ((expected in {"t", "d"} and heard == "ɾ") or (expected == "ɾ" and heard in {"t", "d"})) and previous[:1] in vowel_initials and following[:1] in vowel_initials and previous and following:
        return 1  # A possible intervocalic flap, including across word boundaries.
    # A possible reduced function-word vowel is not a definite misreading.
    # This remains a small edit in the reference score and is labelled as a
    # possible variant, rather than claiming every reduction is correct.
    if word.lower() in WEAK_WORDS and expected in VOWELS and heard in VOWELS and "ə" in (expected, heard):
        return 1
    return EDIT_COST


def word_owners(target_count: int, segments: list[dict[str, Any]]) -> list[int | None]:
    owners: list[int | None] = [None] * target_count
    cursor = 0
    for word_index, segment in enumerate(segments):
        start, end = int(segment["start"]), int(segment["end"])
        if start != cursor or not start < end <= target_count:
            raise ValueError("Target word spans must cover the same phoneme sequence exactly once.")
        owners[start:end] = [word_index] * (end - start)
        cursor = end
    if cursor != target_count:
        raise ValueError("Target word spans do not cover all target phonemes.")
    return owners


def align_phonemes(
    target: list[str], heard: list[str], segments: list[dict[str, Any]],
    evidence: list[dict[str, Any]] | None = None, *, mapping_reliable: bool = True,
) -> tuple[list[dict[str, Any]], float, set[int]]:
    """Return every edit, its cost, and words with ambiguous ownership.

    Insertions have no target index, so they cannot shift later word slices.
    If an extra sound falls BETWEEN words, do not blame either neighbour.
    Examine all minimum-cost paths to avoid blaming the wrong repeated word.
    """
    n, m = len(target), len(heard)
    owners = word_owners(n, segments) if mapping_reliable else [None] * n
    words = [segment["text"] for segment in segments]
    costs = [[phone_cost(t, h, words[owners[i]] if owners[i] is not None else "", target[i - 1] if i else "", target[i + 1] if i + 1 < n else "") for h in heard] for i, t in enumerate(target)]
    forward = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        forward[i][0] = i * EDIT_COST
    for j in range(m + 1):
        forward[0][j] = j * EDIT_COST
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            forward[i][j] = min(forward[i - 1][j] + EDIT_COST, forward[i][j - 1] + EDIT_COST, forward[i - 1][j - 1] + costs[i - 1][j - 1])

    backward = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n, -1, -1):
        backward[i][m] = (n - i) * EDIT_COST
    for j in range(m, -1, -1):
        backward[n][j] = (m - j) * EDIT_COST
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            backward[i][j] = min(backward[i + 1][j] + EDIT_COST, backward[i][j + 1] + EDIT_COST, backward[i + 1][j + 1] + costs[i][j])

    best = forward[n][m]
    ambiguous_words: set[int] = set()
    for j in range(m):
        possible_owners = {
            owners[i] for i in range(n)
            if forward[i][j] + costs[i][j] + backward[i + 1][j + 1] == best
            and owners[i] is not None
        }
        if len(possible_owners) > 1:
            ambiguous_words.update(possible_owners)

    path: list[tuple[str, int | None, int | None, int]] = []
    i, j = n, m
    while i or j:
        if i and j and forward[i][j] == forward[i - 1][j - 1] + costs[i - 1][j - 1]:
            cost = costs[i - 1][j - 1]
            path.append(("match" if cost == 0 else "variant" if cost == 1 else "substitution", i - 1, j - 1, i - 1))
            i, j = i - 1, j - 1
        elif i and forward[i][j] == forward[i - 1][j] + EDIT_COST:
            path.append(("deletion", i - 1, None, i - 1))
            i -= 1
        else:
            path.append(("insertion", None, j - 1, i))
            j -= 1
    path.reverse()

    phones: list[dict[str, Any]] = []
    for operation, ti, hi, boundary in path:
        owner = owners[ti] if ti is not None else None
        if ti is None and 0 < boundary < n:
            left, right = owners[boundary - 1], owners[boundary]
            if left is not None and left == right:
                owner = left
            else:
                ambiguous_words.update(index for index in (left, right) if index is not None)
        confidence = None
        if evidence is not None and hi is not None and hi < len(evidence):
            confidence = evidence[hi].get("confidence")
        uncertain = (
            not mapping_reliable or not heard or owner is None
            or (confidence is not None and confidence < LOW_DECODER_CONFIDENCE)
        )
        phones.append({
            "symbol": f"/{target[ti] if ti is not None else heard[hi]}/",
            "expected": f"/{target[ti]}/" if ti is not None else "/—/",
            "heard": f"/{heard[hi]}/" if hi is not None else "/—/",
            # Kept for older clients. This is edit agreement, NOT a calibrated
            # per-phone accuracy percentage. New UI shows the operation instead.
            "accuracy": 100 if operation == "match" else 75 if operation == "variant" else 0,
            "status": "mixed" if uncertain or operation == "variant" else "correct" if operation == "match" else "needs-work",
            "operation": operation, "targetIndex": ti, "heardIndex": hi,
            "wordIndex": owner, "boundaryIndex": boundary,
            "uncertain": uncertain,
            **({"decoderConfidence": round(confidence, 4)} if confidence is not None else {}),
        })
    for phone in phones:
        if phone["wordIndex"] in ambiguous_words:
            phone["uncertain"] = True
            phone["status"] = "mixed"
    return phones, best / EDIT_COST, ambiguous_words


def decode_phone_evidence(
    token_ids: list[int], id_to_token: dict[int, str], blank_id: int | None,
    probabilities: list[float],
) -> list[dict[str, Any]]:
    """Collapse CTC runs while retaining decoder evidence for each phone."""
    if len(token_ids) != len(probabilities):
        raise ValueError("CTC ids and probabilities must describe the same frames.")
    evidence: list[dict[str, Any]] = []
    start = 0
    while start < len(token_ids):
        end = start + 1
        while end < len(token_ids) and token_ids[end] == token_ids[start]:
            end += 1
        token_id = token_ids[start]
        token = id_to_token.get(token_id, "")
        if token_id != blank_id and token and not token.startswith("<") and token != "|":
            confidence = sum(probabilities[start:end]) / (end - start)
            for phone in token.split():
                evidence.append({"token": phone, "confidence": confidence})
        start = end
    return evidence
