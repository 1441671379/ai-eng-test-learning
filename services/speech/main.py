# FILE: src/ai-engine/main.py
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from threading import Lock, Thread
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from phoneme_scorer import MODEL_NAME, PhonemeScorer
from speech_transcriber import SpeechTranscriber

logging.basicConfig(
    level=os.getenv("ENGLISH_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    force=True,
)

logger = logging.getLogger("english.ai_engine.main")


def configure_torch_cpu_threads() -> None:
    requested = os.getenv("ENGLISH_CPU_THREADS", "").strip()
    if not requested:
        return

    try:
        thread_count = max(1, int(requested))
    except ValueError:
        logger.warning("Ignoring invalid ENGLISH_CPU_THREADS=%s", requested)
        return

    try:
        import torch

        torch.set_num_threads(thread_count)
        if hasattr(torch, "set_num_interop_threads"):
            try:
                torch.set_num_interop_threads(max(1, min(4, thread_count)))
            except RuntimeError:
                pass
        logger.info("Configured AI engine torch CPU threads=%s", thread_count)
    except Exception:
        logger.exception("Failed to configure AI engine torch CPU threads")


configure_torch_cpu_threads()
from remote_tts import RemoteKokoroSynthesizer
reference_tts = RemoteKokoroSynthesizer()
speech_transcriber = SpeechTranscriber()
scorer = PhonemeScorer(
    model_name=MODEL_NAME,
    reference_synthesizer=reference_tts,
)
runtime_warmup_lock = Lock()
from time_first_service import TimeFirstService
time_first_experiment = TimeFirstService(scorer, speech_transcriber)


def prime_audio_runtime_imports() -> None:
    try:
        from transformers import (
            AutoFeatureExtractor,
            WhisperForConditionalGeneration,
            WhisperProcessor,
            Wav2Vec2FeatureExtractor,
            Wav2Vec2ForCTC,
        )

        logger.info(
            "Primed transformer audio imports auto=%s whisper=%s wav2vec=%s",
            AutoFeatureExtractor.__name__,
            WhisperProcessor.__name__,
            Wav2Vec2FeatureExtractor.__name__,
        )
    except Exception:
        logger.exception("Failed to prime transformer audio imports")


def ensure_runtime_warmup_started(force: bool = False) -> None:
    all_ready = (
        scorer.model_loaded
        and reference_tts.model_loaded
        and speech_transcriber.model_loaded
        and time_first_experiment.word_timer.model_loaded
    )
    if all_ready and not force:
        return

    if runtime_warmup_lock.locked():
        return

    def target() -> None:
        with runtime_warmup_lock:
            prime_audio_runtime_imports()

            scorer_start = time.perf_counter()
            try:
                scorer.warmup(force=force)
            finally:
                logger.info(
                    "Post-warmup scorer diagnostics: %s elapsed=%.2fs",
                    scorer.get_diagnostics(),
                    time.perf_counter() - scorer_start,
                )

            tts_start = time.perf_counter()
            try:
                reference_tts.warmup(force=force)
            except Exception:
                logger.exception("Reference TTS warmup failed during background startup")
            finally:
                logger.info(
                    "Post-warmup reference TTS diagnostics: %s elapsed=%.2fs",
                    reference_tts.get_status(),
                    time.perf_counter() - tts_start,
                )

            transcriber_start = time.perf_counter()
            try:
                speech_transcriber.warmup(force=force)
            except Exception:
                logger.exception("Speech transcriber warmup failed during background startup")
            finally:
                logger.info(
                    "Post-warmup ASR diagnostics: %s elapsed=%.2fs",
                    speech_transcriber.get_status(),
                    time.perf_counter() - transcriber_start,
                )

            timing_start = time.perf_counter()
            try:
                time_first_experiment.word_timer.warmup()
            except Exception:
                logger.exception("English word timing warmup failed")
            finally:
                logger.info("Post-warmup word timing: %s elapsed=%.2fs",
                            time_first_experiment.word_timer.status(), time.perf_counter() - timing_start)

    Thread(target=target, daemon=True).start()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("English speech service starting")
    logger.info("Initial scorer diagnostics: %s", scorer.get_diagnostics())
    logger.info("Initial reference TTS diagnostics: %s", reference_tts.get_status())
    logger.info("Initial ASR diagnostics: %s", speech_transcriber.get_status())
    ensure_runtime_warmup_started()
    yield
    if hasattr(reference_tts, "close"):
        await run_in_threadpool(reference_tts.close)
    logger.info("English speech service shutting down")


app = FastAPI(
    title="English Learning Speech Service",
    version="0.1.0",
    description="FastAPI bridge for pronunciation assessment using Meta Wav2Vec2.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, object]:
    if (
        not scorer.model_loaded
        or not reference_tts.model_loaded
        or not speech_transcriber.model_loaded
        or not time_first_experiment.word_timer.model_loaded
    ):
        ensure_runtime_warmup_started()

    tts_status = reference_tts.get_status()
    tts_ready = tts_status.get("ttsReady") is True
    transcriber_ready = speech_transcriber.model_loaded
    model_ready = scorer.model_loaded
    timing_status = time_first_experiment.word_timer.status()
    overall_ready = bool(model_ready and transcriber_ready and tts_ready and timing_status["ready"])

    payload = {
        "service": "speech",
        "sourceRoot": os.path.dirname(os.path.abspath(__file__)),
        "status": "ok" if overall_ready else "warming",
        "model": MODEL_NAME,
        "modelReady": model_ready,
        "loadError": scorer.load_error,
        "hfTokenConfigured": bool(os.getenv("HF_TOKEN")),
        "wordTiming": timing_status,
        "diagnostics": scorer.get_diagnostics(),
        **tts_status,
        **speech_transcriber.get_status(),
    }
    logger.info(
        "Health response status=%s modelReady=%s loadError=%s ttsReady=%s ttsDevice=%s ttsProvider=%s",
        payload["status"],
        payload["modelReady"],
        payload["loadError"],
        payload["ttsReady"],
        payload["ttsDevice"],
        payload.get("ttsProvider"),
    )
    return payload


@app.post("/assess")
async def assess(audio: UploadFile = File(...), text: str = Form(...)) -> dict[str, object]:
    logger.info(
        "Assess request received filename=%s content_type=%s target=%s",
        audio.filename,
        audio.content_type,
        text,
    )
    audio_bytes = await audio.read()

    if not audio_bytes:
        logger.warning("Assess rejected because uploaded audio was empty")
        raise HTTPException(status_code=400, detail="Audio upload is empty.")

    if not text.strip():
        logger.warning("Assess rejected because target text was empty")
        raise HTTPException(status_code=400, detail="Target text is required.")

    try:
        result = scorer.assess(
            audio_bytes=audio_bytes,
            target_text=text,
            filename=audio.filename,
        )
    except RuntimeError as exc:
        logger.exception("Assess failed with runtime error")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        logger.exception("Assess failed with value error")
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result["filename"] = audio.filename
    result["contentType"] = audio.content_type
    logger.info(
        "Assess response score=%s transcript=%s",
        result.get("overallScore"),
        result.get("transcript"),
    )
    return result


@app.get("/experiments/time-alignment/status")
async def time_alignment_status() -> dict[str, object]:
    return time_first_experiment.status()


@app.post("/experiments/time-alignment")
async def time_alignment(audio: UploadFile = File(...), text: str = Form(...), spoken_text: str = Form("")) -> dict[str, object]:
    audio_bytes = await audio.read(25 * 1024 * 1024 + 1)
    if not audio_bytes or len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="请提供不超过 25 MB 的录音。")
    try:
        return await run_in_threadpool(time_first_experiment.analyze, audio_bytes, text, spoken_text, audio.filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)) -> dict[str, object]:
    logger.info(
        "Transcribe request received filename=%s content_type=%s",
        audio.filename,
        audio.content_type,
    )
    audio_bytes = await audio.read()

    if not audio_bytes:
        logger.warning("Transcribe rejected because uploaded audio was empty")
        raise HTTPException(status_code=400, detail="Audio upload is empty.")

    try:
        result = speech_transcriber.transcribe(
            audio_bytes=audio_bytes,
            filename=audio.filename,
        )
    except RuntimeError as exc:
        logger.exception("Transcribe failed with runtime error")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        logger.exception("Transcribe failed with value error")
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result["filename"] = audio.filename
    result["contentType"] = audio.content_type
    logger.info("Transcribe response transcript=%s", result.get("transcript"))
    return result


@app.get("/reference-audio")
async def reference_audio(
    text: str,
    instruct: str | None = Query(default=None),
    voice_id: str | None = Query(default=None),
    pronunciation: str | None = Query(default=None),
) -> Response:
    request_id = uuid4().hex[:8]
    stripped_text = text.strip()
    preview = " ".join(stripped_text.split())
    if len(preview) > 120:
        preview = f"{preview[:119]}…"

    logger.info(
        "Reference audio request received id=%s chars=%s instruct=%s preview=%s",
        request_id,
        len(stripped_text),
        instruct,
        preview,
    )

    if not stripped_text:
        logger.warning("Reference audio rejected because target text was empty")
        raise HTTPException(status_code=400, detail="Target text is required.")

    try:
        start_time = time.perf_counter()
        kwargs = {"text": text, "instruct": instruct}
        await run_in_threadpool(reference_tts.warmup)
        voice_id = voice_id or reference_tts.selected_voice()
        kwargs["voice_id"] = voice_id
        if reference_tts.provider_label == 'kokoro':
            kwargs['pronunciation'] = pronunciation
        audio_bytes = await run_in_threadpool(reference_tts.synthesize, **kwargs)
        logger.info(
            "Reference audio request complete id=%s bytes=%s elapsed=%.2fs ttsDevice=%s",
            request_id,
            len(audio_bytes),
            time.perf_counter() - start_time,
            reference_tts.device_label,
        )
    except RuntimeError as exc:
        logger.exception("Reference audio failed with runtime error id=%s", request_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        logger.exception("Reference audio failed with value error id=%s", request_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store", "X-TTS-Engine": reference_tts.provider_label, "X-TTS-Voice": voice_id or "default"},
    )


@app.post("/reference-audio")
async def reference_audio_post(
    text: str = Form(...),
    instruct: str = Form(default=""),
    voice_id: str = Form(default=""),
    pronunciation: str = Form(default=""),
) -> Response:
    return await reference_audio(text=text, instruct=instruct or None, voice_id=voice_id or None, pronunciation=pronunciation or None)


@app.get("/voice-options")
async def voice_options():
    await run_in_threadpool(reference_tts.warmup)
    return reference_tts.voice_options()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("AI_ENGINE_HOST", "0.0.0.0"),
        port=int(os.getenv("AI_ENGINE_PORT", "8000")),
        log_config=None,
    )
