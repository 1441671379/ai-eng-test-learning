"""Text preparation for local reference speech."""
import json
import os
from pathlib import Path
import re

TTS_WORD_MAX_WORDS = int(os.getenv("ENGLISH_TTS_WORD_MAX_WORDS", "2"))
TTS_NARRATION_THRESHOLD = int(os.getenv("ENGLISH_TTS_NARRATION_THRESHOLD", "120"))
IPA_NARRATION_MAP = json.loads((Path(__file__).parent.parent / "data/ipa_narration.json").read_text(encoding="utf-8"))["map"]

def normalize_narration_text(text: str) -> str:
    normalized = text.strip()
    if not normalized:
        return normalized

    normalized = normalized.replace("—", ". ").replace("–", ". ")

    def replace_ipa(match: re.Match[str]) -> str:
        token = match.group(1).strip()
        if not token:
            return " "
        replacement = IPA_NARRATION_MAP.get(token)
        if replacement:
            return f" {replacement} "
        return f" {token} "

    normalized = re.sub(r"/([^/\n]{1,16})/", replace_ipa, normalized)
    normalized = re.sub(r"\s+\.\s+", ". ", normalized)
    normalized = re.sub(r"\s+,", ",", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()

def classify_tts_mode(text: str) -> str:
    words = re.findall(r"[A-Za-z']+", text)
    if len(words) <= TTS_WORD_MAX_WORDS and len(text) <= TTS_NARRATION_THRESHOLD:
        return "word"
    return "narration"

def normalize_reference_word_text(text: str) -> str:
    normalized = normalize_narration_text(text)
    if not normalized:
        return normalized
    if normalized[-1] not in ".!?":
        normalized = f"{normalized}."
    return normalized
