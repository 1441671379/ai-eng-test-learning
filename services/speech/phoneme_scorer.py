# FILE: src/ai-engine/phoneme_scorer.py
from __future__ import annotations

import importlib.metadata
import importlib.util
import io
import json
import logging
import os
import re
import shutil
import subprocess
import sys
from typing import Any

import pathlib

import numpy as np
import soundfile as sf
from phone_alignment import align_phonemes, decode_phone_evidence, word_owners


MODEL_NAME = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
# The default branch of this model still exposes pickle weights. Pin the
# known safetensors snapshot so desktop installs can stay on the Intel-safe
# torch build while satisfying the newer transformers security checks.
MODEL_REVISION = "3e836924cfd3b858a0bbdbc1f7ef412105d00446"
MODEL_WEIGHTS_FILENAME = "model.safetensors"
logger = logging.getLogger("english.ai_engine.scorer")

_TARGETS_PATH = pathlib.Path(__file__).parent.parent / "data" / "practice_targets.json"
with _TARGETS_PATH.open(encoding="utf-8") as _f:
    PRACTICE_TARGETS: dict[str, dict[str, Any]] = json.load(_f)["words"]

logger.info("Loaded %d practice targets from %s", len(PRACTICE_TARGETS), _TARGETS_PATH)

TARGET_SAMPLE_RATE = 16000


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def _normalize_phoneme_string(raw_value: str) -> str:
    return " ".join(part for part in raw_value.replace("|", " ").split() if part)


def _decode_ctc_predictions(
    token_ids: list[int],
    id_to_token: dict[int, str],
    blank_id: int | None,
) -> str:
    pieces: list[str] = []
    previous_id: int | None = None

    for token_id in token_ids:
        if token_id == previous_id:
            continue

        previous_id = token_id

        if blank_id is not None and token_id == blank_id:
            continue

        token = id_to_token.get(token_id, "")

        if not token or token.startswith("<"):
            continue

        if token == "|":
            pieces.append(" ")
        else:
            pieces.append(token)

    return _normalize_phoneme_string(" ".join(pieces))


def _decode_with_ffmpeg(audio_bytes: bytes) -> tuple[np.ndarray, int] | None:
    if shutil.which("ffmpeg") is None:
        return None

    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                "pipe:0",
                "-f",
                "wav",
                "-ac",
                "1",
                "-ar",
                str(TARGET_SAMPLE_RATE),
                "pipe:1",
            ],
            input=audio_bytes,
            capture_output=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None

    if result.returncode != 0 or not result.stdout:
        return None

    try:
        waveform, sample_rate = sf.read(
            io.BytesIO(result.stdout),
            dtype="float32",
            always_2d=True,
        )
    except Exception:
        return None

    return waveform, sample_rate


def _load_audio(audio_bytes: bytes, filename: str | None = None) -> np.ndarray:
    del filename

    try:
        waveform, sample_rate = sf.read(
            io.BytesIO(audio_bytes),
            dtype="float32",
            always_2d=True,
        )
    except Exception as exc:
        # Mobile clients (Android in particular) can only record compressed
        # formats such as m4a/AAC; fall back to ffmpeg when it is available.
        decoded = _decode_with_ffmpeg(audio_bytes)
        if decoded is None:
            raise ValueError(
                "The uploaded file did not contain decodable audio. "
                "Upload WAV, or install ffmpeg to enable m4a/webm support."
            ) from exc
        waveform, sample_rate = decoded

    if waveform.size == 0:
        raise ValueError("The uploaded file did not contain decodable audio.")

    mono_waveform = waveform.mean(axis=1, dtype=np.float32)
    if mono_waveform.size == 0:
        raise ValueError("The uploaded file did not contain decodable audio.")

    if sample_rate != TARGET_SAMPLE_RATE:
        duration_seconds = mono_waveform.size / max(sample_rate, 1)
        target_length = max(1, int(round(duration_seconds * TARGET_SAMPLE_RATE)))
        source_positions = np.linspace(
            0,
            mono_waveform.size - 1,
            num=mono_waveform.size,
            dtype=np.float32,
        )
        target_positions = np.linspace(
            0,
            mono_waveform.size - 1,
            num=target_length,
            dtype=np.float32,
        )
        mono_waveform = np.interp(target_positions, source_positions, mono_waveform)

    return mono_waveform.astype(np.float32, copy=False)


def _tokenize_visible_words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*", text)


def _phonemize_target_phrase(target_text: str, language: str = "en-us") -> dict[str, Any]:
    try:
        from phonemizer import phonemize
        from phonemizer.separator import Separator
    except Exception as exc:
        raise ValueError(
            "Dynamic target phonemization is unavailable because phonemizer could not be imported."
        ) from exc

    separator = Separator(phone=" ", word=" | ")
    normalized_phrase = target_text.strip()
    if not normalized_phrase:
        raise ValueError("Target text is empty.")

    words = _tokenize_visible_words(normalized_phrase)
    if not words:
        raise ValueError(f"No pronounceable words were found in '{target_text}'.")

    # One batch entry per visible word. eSpeak can both merge words ("I am")
    # and expand numbers ("25") in a sentence; those changes can even cancel
    # out, so matching the total word count is not proof of correct ownership.
    # Construct the scored sentence AND word spans from these same entries.
    word_outputs = phonemize(
        words,
        language=language,
        backend="espeak",
        separator=separator,
        strip=True,
        preserve_punctuation=False,
        with_stress=False,
        njobs=1,
        language_switch="remove-flags",
    )
    chunks = [_normalize_phoneme_string(chunk) for chunk in word_outputs]
    if len(chunks) != len(words) or any(not chunk for chunk in chunks):
        raise ValueError(f"Could not map all target words to phonemes for '{target_text}'.")

    segments: list[dict[str, Any]] = []
    cursor = 0
    for word, chunk in zip(words, chunks, strict=True):
        token_count = len(chunk.split())
        segments.append(
            {
                "text": word,
                "start": cursor,
                "end": cursor + token_count,
            }
        )
        cursor += token_count

    return {
        "ipa": " ".join(chunks),
        "segments": segments,
        "targetSource": "word-batch",
        "wordMappingReliable": True,
    }


def _build_live_assessment_from_target(
    target_text: str,
    practice_target: dict[str, Any],
    transcription: str,
    audio_duration_seconds: float | None = None,
    phone_evidence: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    del audio_duration_seconds  # No proportional word timestamps are published.
    heard_tokens = transcription.split()
    target_tokens = practice_target["ipa"].split()
    if not target_tokens:
        raise ValueError("A reliable phoneme target is unavailable; no pronunciation score was generated.")
    segments = practice_target["segments"]
    reliable = practice_target.get("wordMappingReliable", True)
    if reliable:
        word_owners(len(target_tokens), segments)
    if phone_evidence is not None and [item["token"] for item in phone_evidence] != heard_tokens:
        raise ValueError("Decoder evidence does not match the heard phoneme sequence.")
    phonemes, distance, ambiguous_words = align_phonemes(
        target_tokens, heard_tokens, segments, phone_evidence, mapping_reliable=reliable,
    )
    baseline = max(len(target_tokens), len(heard_tokens), 1)
    overall_score = _clamp(round((1 - (distance / baseline)) * 100), 0, 100)
    target_is_phrase = len(_tokenize_visible_words(target_text)) > 1
    highlights = []
    for seg_index, segment in enumerate(segments):
        segment_phonemes = [phone for phone in phonemes if phone["wordIndex"] == seg_index]
        issues = [phone for phone in segment_phonemes if phone["operation"] not in ("match", "variant") and not phone["uncertain"]]
        has_uncertain_sounds = any(phone["uncertain"] for phone in segment_phonemes)
        # A low-confidence MATCH elsewhere in the word must not hide an
        # independently well-supported /theta/ -> /s/ substitution, for example.
        uncertain = not reliable or not heard_tokens or seg_index in ambiguous_words or (has_uncertain_sounds and not issues)
        variants = [phone for phone in segment_phonemes if phone["operation"] == "variant"]
        status = "mixed" if uncertain or not segment_phonemes else "needs-work" if issues else "mixed" if variants else "correct"
        expected_segment = (
            f"/{' '.join(item['expected'].strip('/') for item in segment_phonemes)}/"
            if segment_phonemes
            else "/—/"
        )
        heard_segment = (
            f"/{' '.join(item['heard'].strip('/') for item in segment_phonemes)}/"
            if segment_phonemes
            else "/—/"
        )

        highlight: dict[str, Any] = {
            "text": segment["text"],
            "status": status,
            "wordIndex": seg_index,
            "uncertain": uncertain,
            "hasUncertainSounds": has_uncertain_sounds,
            "expected": expected_segment,
            "heard": heard_segment,
            "issues": [{"operation": phone["operation"], "expected": phone["expected"], "heard": phone["heard"]} for phone in issues],
        }
        if uncertain or not segment_phonemes:
            highlight["feedback"] = "Unable to reliably assign the heard sounds to this word. Check the full recording; this is not a confirmed misreading."
        elif issues:
            details = []
            for phone in issues:
                if phone["operation"] == "deletion":
                    details.append(f"Possible missing sound {phone['expected']}")
                elif phone["operation"] == "insertion":
                    details.append(f"Possible extra sound {phone['heard']}")
                else:
                    details.append(f"Expected {phone['expected']}, heard {phone['heard']}")
            highlight["feedback"] = "; ".join(details) + f". Target {expected_segment}; decoded {heard_segment}."
            if has_uncertain_sounds:
                highlight["feedback"] += " Other low-confidence sounds in this word remain unconfirmed."
        elif variants:
            highlight["feedback"] = f"Possible weak-form vowel or connected-speech flap: target {expected_segment}, decoded {heard_segment}. This is not a definite misreading."
        else:
            highlight["feedback"] = f"The decoded sounds match this word's target {expected_segment}."
        highlights.append(highlight)
    needs_work = [item for item in highlights if item["status"] == "needs-work"]
    uncertain_count = sum(item["uncertain"] for item in highlights)
    extra = [phone for phone in phonemes if phone["operation"] == "insertion" and phone["wordIndex"] is None]
    if not heard_tokens:
        summary = "No clear phonemes were decoded. Word-level errors cannot be confirmed from this recording."
        next_step = "Check your microphone and record the full target again."
    elif needs_work:
        names = ", ".join(item["text"] for item in needs_work[:4])
        summary = f"Possible sound differences in {names}. Select a word to inspect the expected and decoded sounds."
        next_step = f"Practise {needs_work[0]['text']} slowly, then repeat the full {'reply' if target_is_phrase else 'word'}."
    elif uncertain_count or extra:
        summary = "Some sounds could not be assigned reliably, or extra sounds were detected. The word feedback needs review."
        next_step = "Listen to your full recording and try the target again without extra or repeated words."
    else:
        summary = "The decoded sounds match the target, with any possible weak-form vowels noted below."
        next_step = "Repeat the full reply at a natural pace." if target_is_phrase else "Repeat the word once more at a natural pace."
    warning = None
    if uncertain_count:
        warning = "部分词的识别或归属不确定，已标为“无法确认”；这些词不能直接判为误读。总分是音素一致性参考分。"
    elif extra:
        warning = "检测到额外音素，无法确定属于哪个单词，未归到相邻词；请回听整句确认是否多读或重复。"
    return {
        "targetText": target_text.strip() or target_text,
        "ipaTarget": f"/{practice_target['ipa']}/",
        "transcript": transcription,
        "overallScore": overall_score,
        "summary": summary,
        "nextStep": next_step,
        "engine": MODEL_NAME,
        "scoringVersion": "word-alignment-v2",
        "scoreKind": "phoneme-consistency",
        "targetSource": practice_target.get("targetSource", "curated"),
        **({"assessmentWarning": warning} if warning else {}),
        "highlights": highlights,
        "phonemes": phonemes,
    }


class PhonemeScorer:
    def __init__(
        self,
        model_name: str = MODEL_NAME,
        reference_synthesizer: Any | None = None,
    ) -> None:
        self.model_name = model_name
        self.model_revision = MODEL_REVISION
        self.reference_synthesizer = reference_synthesizer
        self.model_loaded = False
        self.load_error: str | None = None
        self.device: Any | None = None
        self.model: Any | None = None
        self.feature_extractor: Any | None = None
        self.id_to_token: dict[int, str] = {}
        self.blank_id: int | None = None
        self.dynamic_target_cache: dict[str, dict[str, Any]] = {}

    def get_diagnostics(self) -> dict[str, Any]:
        phonemizer_spec = importlib.util.find_spec("phonemizer")

        try:
            phonemizer_version = (
                importlib.metadata.version("phonemizer")
                if phonemizer_spec
                else None
            )
        except importlib.metadata.PackageNotFoundError:
            phonemizer_version = None

        return {
            "pythonExecutable": sys.executable,
            "pythonVersion": sys.version,
            "workingDirectory": os.getcwd(),
            "phonemizerImportable": phonemizer_spec is not None,
            "phonemizerVersion": phonemizer_version,
            "espeakPath": shutil.which("espeak"),
            "espeakNgPath": shutil.which("espeak-ng"),
            "hfTokenConfigured": bool(os.getenv("HF_TOKEN")),
            "modelLoaded": self.model_loaded,
            "loadError": self.load_error,
            "modelName": self.model_name,
            "modelRevision": self.model_revision,
            "modelWeights": MODEL_WEIGHTS_FILENAME,
            "device": str(self.device) if self.device is not None else None,
        }

    def warmup(self, force: bool = False) -> None:
        """Prepare the transformer objects lazily when you're ready for real inference."""
        if self.model_loaded and not force:
            return

        logger.info("Warmup started for model %s", self.model_name)
        logger.info("Dependency diagnostics: %s", self.get_diagnostics())

        try:
            import torch
            from huggingface_hub import hf_hub_download
            from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
        except Exception as exc:  # pragma: no cover - depends on local env
            self.load_error = str(exc)
            logger.exception("Warmup failed during imports")
            return

        try:
            vocab_path = hf_hub_download(
                repo_id=self.model_name,
                filename="vocab.json",
                revision=self.model_revision,
            )
            hf_hub_download(
                repo_id=self.model_name,
                filename=MODEL_WEIGHTS_FILENAME,
                revision=self.model_revision,
            )
            with open(vocab_path, "r", encoding="utf-8") as vocab_file:
                vocab = json.load(vocab_file)

            self.id_to_token = {token_id: token for token, token_id in vocab.items()}
            self.feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(
                self.model_name,
                revision=self.model_revision,
            )
            self.model = Wav2Vec2ForCTC.from_pretrained(
                self.model_name,
                revision=self.model_revision,
                use_safetensors=True,
            )
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self.model.to(self.device)
            self.model.eval()
            self.blank_id = (
                self.model.config.pad_token_id
                if getattr(self.model.config, "pad_token_id", None) is not None
                else vocab.get("<pad>")
            )
        except Exception as exc:  # pragma: no cover - depends on local env
            self.load_error = str(exc)
            self.model_loaded = False
            self.feature_extractor = None
            self.model = None
            self.device = None
            self.id_to_token = {}
            self.blank_id = None
            logger.exception("Warmup failed while loading model assets")
            return

        self.model_loaded = True
        self.load_error = None
        logger.info(
            "Warmup complete. device=%s blank_id=%s vocab_size=%s revision=%s",
            self.device,
            self.blank_id,
            len(self.id_to_token),
            self.model_revision,
        )

    def _decode_waveform_with_evidence(self, waveform: np.ndarray) -> tuple[str, list[dict[str, Any]]]:
        import torch

        inputs = self.feature_extractor(
            waveform,
            sampling_rate=16000,
            return_tensors="pt",
            padding="longest",
        )

        input_values = inputs.input_values.to(self.device)
        attention_mask = (
            inputs.attention_mask.to(self.device)
            if hasattr(inputs, "attention_mask") and inputs.attention_mask is not None
            else None
        )

        with torch.no_grad():
            logits = self.model(input_values, attention_mask=attention_mask).logits

        probabilities, predicted_ids = torch.softmax(logits.float(), dim=-1).max(dim=-1)
        evidence = decode_phone_evidence(
            predicted_ids[0].tolist(), self.id_to_token, self.blank_id,
            probabilities[0].tolist(),
        )
        return " ".join(item["token"] for item in evidence), evidence

    def _decode_waveform(self, waveform: np.ndarray) -> str:
        return self._decode_waveform_with_evidence(waveform)[0]

    def _derive_target_from_reference_audio(self, target_text: str) -> dict[str, Any]:
        if self.reference_synthesizer is None:
            raise ValueError(
                "No IPA target mapping is configured and no reference synthesizer is available for fallback."
            )

        logger.info(
            "Falling back to reference-audio target derivation for %s",
            target_text,
        )
        reference_audio = self.reference_synthesizer.synthesize(text=target_text)
        reference_waveform = _load_audio(reference_audio, filename="reference.wav")
        reference_transcription = self._decode_waveform(reference_waveform)

        if not reference_transcription:
            raise ValueError(
                f"Could not derive a phoneme target from reference audio for '{target_text}'."
            )

        return {
            "ipa": reference_transcription,
            # TTS audio does not supply trustworthy word ownership. Do not
            # invent it from character lengths and blame adjacent words.
            "segments": [{"text": word, "start": 0, "end": 0} for word in _tokenize_visible_words(target_text)],
            "wordMappingReliable": False,
            "targetSource": "reference-audio-unmapped",
        }

    def _resolve_target_definition(self, target_text: str) -> dict[str, Any]:
        normalized_target = target_text.strip().lower()
        if normalized_target in PRACTICE_TARGETS:
            curated = PRACTICE_TARGETS[normalized_target]
            # Curated targets contain spelling fragments ("Th", "i", "nk").
            # Word feedback must show the whole word, not those fragments.
            if len(_tokenize_visible_words(target_text)) == 1:
                return {**curated, "segments": [{"text": target_text.strip(), "start": 0, "end": len(curated["ipa"].split())}], "wordMappingReliable": True, "targetSource": "curated"}
            return curated

        cached_target = self.dynamic_target_cache.get(normalized_target)
        if cached_target:
            return cached_target

        # --- Try phonemizer (fast, no audio needed) ---
        try:
            resolved_target = _phonemize_target_phrase(target_text)
            logger.info(
                "Dynamic target derived with phonemizer target=%s ipa=%s",
                target_text,
                resolved_target["ipa"],
            )
            self.dynamic_target_cache[normalized_target] = resolved_target
            return resolved_target
        except Exception as exc:
            logger.warning(
                "Dynamic phonemization unavailable for target=%s reason=%s",
                target_text,
                exc,
            )

        # --- Try reference-audio derivation (TTS → wav2vec2 decode) ---
        try:
            resolved_target = self._derive_target_from_reference_audio(target_text)
            logger.info(
                "Dynamic target derived from reference audio target=%s ipa=%s",
                target_text,
                resolved_target["ipa"],
            )
            self.dynamic_target_cache[normalized_target] = resolved_target
            return resolved_target
        except Exception as exc:
            logger.warning(
                "Reference-audio target derivation also failed for target=%s reason=%s; "
                "no pronunciation score will be generated",
                target_text,
                exc,
            )

        raise ValueError("Could not derive a phoneme target. Pronunciation scoring is unavailable; please retry.")

    def assess(
        self,
        audio_bytes: bytes,
        target_text: str,
        filename: str | None = None,
    ) -> dict[str, Any]:
        """Decode real audio and return a reference score and word-owned edits."""
        duration_hint_seconds = round(max(len(audio_bytes) / 32000.0, 0.4), 2)
        self.warmup()

        if (
            not self.model_loaded
            or self.model is None
            or self.feature_extractor is None
            or not self.id_to_token
        ):
            raise RuntimeError(self.load_error or "The Wav2Vec2 model is not ready.")

        try:
            waveform = _load_audio(audio_bytes, filename=filename)
            logger.info(
                "Assessing target=%s filename=%s bytes=%s duration_hint=%s",
                target_text,
                filename,
                len(audio_bytes),
                duration_hint_seconds,
            )

            transcription, evidence = self._decode_waveform_with_evidence(waveform)
            practice_target = self._resolve_target_definition(target_text)
            waveform_duration = float(waveform.shape[0]) / float(TARGET_SAMPLE_RATE)
            assessment = _build_live_assessment_from_target(
                target_text,
                practice_target,
                transcription,
                audio_duration_seconds=waveform_duration,
                phone_evidence=evidence,
            )
            logger.info(
                "Assessment complete. target=%s score=%s transcript=%s",
                target_text,
                assessment["overallScore"],
                assessment["transcript"],
            )
        except Exception as exc:  # pragma: no cover - depends on local env
            logger.exception("Assessment failed")
            raise RuntimeError(f"Live model inference failed: {exc}") from exc

        assessment["durationHintSeconds"] = duration_hint_seconds
        assessment["modelReady"] = self.model_loaded
        assessment["loadError"] = self.load_error
        return assessment

    def transcribe(
        self,
        audio_bytes: bytes,
        filename: str | None = None,
    ) -> dict[str, Any]:
        duration_hint_seconds = round(max(len(audio_bytes) / 32000.0, 0.4), 2)
        self.warmup()

        if (
            not self.model_loaded
            or self.model is None
            or self.feature_extractor is None
            or not self.id_to_token
        ):
            raise RuntimeError(self.load_error or "The Wav2Vec2 model is not ready.")

        try:
            waveform = _load_audio(audio_bytes, filename=filename)
            transcription = self._decode_waveform(waveform)
            logger.info(
                "Transcription complete. filename=%s transcript=%s",
                filename,
                transcription,
            )
        except Exception as exc:  # pragma: no cover - depends on local env
            logger.exception("Transcription failed")
            raise RuntimeError(f"Live model transcription failed: {exc}") from exc

        return {
            "transcript": transcription,
            "engine": MODEL_NAME,
            "durationHintSeconds": duration_hint_seconds,
            "modelReady": self.model_loaded,
            "loadError": self.load_error,
        }
