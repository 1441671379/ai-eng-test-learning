"""Offline English word timing, owned and cached by the shared speech process.

The trellis/backtracking/repeat merging below is adapted from WhisperX 3.7.9
(Max Bain, BSD-2-Clause; see licenses/WhisperX-BSD-2-Clause.txt). Only the
English, single-segment path is retained. No WhisperX, NLTK, pandas, VAD,
diarization, transcription or external Python process is used here.
"""
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import threading
import time

import numpy as np
import torch

MODEL = "WAV2VEC2_ASR_BASE_960H"
VERSION = "english-ctc-v1"
WEIGHT_FILE = "wav2vec2_fairseq_base_ls960_asr_ls960.pth"
WEIGHT_SHA256 = "488fd4f16de84438ffc945334278c1b9fb9b7159a806c1080b16111a958c945d"
ROOT = Path(__file__).resolve().parents[2]


def get_trellis(emission, tokens, blank_id=0):
    num_frame, num_tokens = emission.size(0), len(tokens)
    trellis = torch.empty((num_frame + 1, num_tokens + 1))
    trellis[0, 0] = 0
    trellis[1:, 0] = torch.cumsum(emission[:, blank_id], 0)
    trellis[0, -num_tokens:] = -float("inf")
    trellis[-num_tokens:, 0] = float("inf")
    for t in range(num_frame):
        trellis[t + 1, 1:] = torch.maximum(
            trellis[t, 1:] + emission[t, blank_id],
            trellis[t, :-1] + emission[t, tokens],
        )
    return trellis


@dataclass
class Point:
    token_index: int
    time_index: int
    score: float


def backtrack(trellis, emission, tokens, blank_id=0):
    j = trellis.size(1) - 1
    t_start = torch.argmax(trellis[:, j]).item()
    path = []
    for t in range(t_start, 0, -1):
        stayed = trellis[t - 1, j] + emission[t - 1, blank_id]
        changed = trellis[t - 1, j - 1] + emission[t - 1, tokens[j - 1]]
        probability = emission[t - 1, tokens[j - 1] if changed > stayed else blank_id].exp().item()
        path.append(Point(j - 1, t - 1, probability))
        if changed > stayed:
            j -= 1
            if j == 0:
                break
    else:
        return None
    return path[::-1]


@dataclass
class Segment:
    label: str
    start: int
    end: int
    score: float


def merge_repeats(path, transcript):
    i1, segments = 0, []
    while i1 < len(path):
        i2 = i1
        while i2 < len(path) and path[i1].token_index == path[i2].token_index:
            i2 += 1
        score = sum(p.score for p in path[i1:i2]) / (i2 - i1)
        segments.append(Segment(transcript[path[i1].token_index], path[i1].time_index,
                                path[i2 - 1].time_index + 1, score))
        i1 = i2
    return segments


def align_emission(emission, text, dictionary, duration):
    """Character CTC path -> word intervals; never invent missing intervals."""
    clean = text.lower().replace(" ", "|")
    fallback = {"segments": [{"start": 0., "end": duration, "text": text,
                              "words": [], "chars": []}], "word_segments": []}
    if not clean or emission.size(0) < len(clean):
        return fallback
    blank_id = dictionary.get("[pad]", dictionary.get("<pad>", 0))
    if any(c not in dictionary for c in clean):
        non_blank = torch.ones(emission.size(1), dtype=torch.bool)
        non_blank[blank_id] = False
        wildcard = emission[:, non_blank].max(dim=1).values
        emission = torch.cat([emission, wildcard.unsqueeze(1)], dim=1)
        wildcard_id = emission.size(1) - 1
        tokens = [dictionary.get(c, wildcard_id) for c in clean]
    else:
        tokens = [dictionary[c] for c in clean]
    trellis = get_trellis(emission, tokens, blank_id)
    path = backtrack(trellis, emission, tokens, blank_id)
    if path is None:
        return fallback
    runs = merge_repeats(path, clean)
    ratio = duration / emission.size(0)
    chars = [{"char": char, "start": round(run.start * ratio, 3),
              "end": round(run.end * ratio, 3), "score": round(run.score, 3)}
             for char, run in zip(text, runs)]
    words, offset = [], 0
    for word in text.split(" "):
        word_chars = chars[offset:offset + len(word)]
        if word_chars:
            words.append({"word": word, "start": min(c["start"] for c in word_chars),
                          "end": max(c["end"] for c in word_chars),
                          "score": round(float(np.mean([c["score"] for c in word_chars])), 3)})
        offset += len(word) + 1
    return {"segments": [{"start": min(c["start"] for c in chars),
                           "end": max(w["end"] for w in words), "text": text,
                           "words": words, "chars": chars}], "word_segments": words}


class EnglishWordTimer:
    def __init__(self, model_path=None, device=None):
        default = Path(os.getenv("HF_HOME", str(ROOT / "models"))) / "word-alignment" / WEIGHT_FILE
        self.model_path = Path(model_path or os.getenv("ENGLISH_WORD_ALIGNMENT_MODEL", str(default)))
        requested = device or os.getenv("ENGLISH_WORD_ALIGNMENT_DEVICE", "auto")
        if requested not in ("auto", "cpu", "cuda"):
            raise ValueError("Invalid ENGLISH_WORD_ALIGNMENT_DEVICE")
        self.device = "cuda" if requested != "cpu" and torch.cuda.is_available() else "cpu"
        self.model, self.dictionary, self.load_error = None, None, None
        self.load_lock, self.inference_lock = threading.Lock(), threading.Lock()

    @property
    def model_loaded(self):
        return self.model is not None

    def status(self):
        configured = self.model_path.is_file()
        return {"provider": VERSION, "model": MODEL, "configured": configured,
                "ready": self.model_loaded, "device": self.device,
                "error": self.load_error or (None if configured else "公共英文时间定位权重缺失。")}

    def warmup(self):
        if self.model_loaded:
            return
        with self.load_lock:
            if self.model_loaded:
                return
            try:
                if not self.model_path.is_file():
                    raise RuntimeError("公共英文时间定位权重缺失；不会自动下载或调用外部 WhisperX。")
                with self.model_path.open("rb") as stream:
                    digest = hashlib.file_digest(stream, "sha256").hexdigest()
                if digest != WEIGHT_SHA256 or self.model_path.name != WEIGHT_FILE:
                    raise RuntimeError("公共英文时间定位权重校验失败。")
                import torchaudio
                bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
                # The verified file already exists: torch.hub never downloads it.
                model = bundle.get_model(dl_kwargs={"model_dir": str(self.model_path.parent),
                                                   "weights_only": True}).to(self.device).eval()
                self.dictionary = {c.lower(): i for i, c in enumerate(bundle.get_labels())}
                self.model, self.load_error = model, None
            except Exception as exc:
                self.load_error = str(exc)
                raise

    def align(self, waveform, text):
        waveform = np.asarray(waveform, dtype=np.float32)
        if waveform.ndim != 1 or not np.isfinite(waveform).all() or not .2 <= len(waveform) / 16000 <= 45:
            raise ValueError("时间定位需要 0.2–45 秒、16 kHz 的有效单声道录音。")
        text = " ".join(text.split())
        if not text or len(text) > 600:
            raise ValueError("时间定位文字为空或超过 600 字符。")
        start, cached = time.perf_counter(), self.model_loaded
        self.warmup()
        loaded = time.perf_counter()
        with self.inference_lock, torch.inference_mode():
            emissions, _ = self.model(torch.from_numpy(waveform).unsqueeze(0).to(self.device), lengths=None)
            emission = torch.log_softmax(emissions, dim=-1)[0].cpu().detach()
        aligned = align_emission(emission, text, self.dictionary, len(waveform) / 16000)
        return {"aligned": aligned, "version": VERSION, "model": MODEL, "device": self.device,
                "duration": len(waveform) / 16000, "modelWasCached": cached,
                "modelLoadSeconds": loaded - start, "alignmentSeconds": time.perf_counter() - loaded}
