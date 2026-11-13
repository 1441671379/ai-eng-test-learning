# FILE: src/coach-engine/main.py
from __future__ import annotations

import logging
import asyncio
import hmac
from pathlib import Path
import os
import time
from contextlib import asynccontextmanager
from threading import Lock, Thread

from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from starlette.concurrency import run_in_threadpool
from feedback_settings import FeedbackSettings
from feedback import FeedbackService
from reading import ReadingService
from listening import ListeningService
from writing import WritingService
from global_model import coach_turn as generate_global_coach, just_speak as generate_global_just_speak
from vocabulary_import import preview_import
from vocabulary_model import explain_word
from phrase_learning import phrase_learning
from fastapi.middleware.cors import CORSMiddleware

from local_backend import create_local_engine, local_llm_enabled

logging.basicConfig(
    level=os.getenv("ENGLISH_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    force=True,
)

logger = logging.getLogger("english.coach_engine.main")


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
        logger.info("Configured coach engine torch CPU threads=%s", thread_count)
    except Exception:
        logger.exception("Failed to configure coach engine torch CPU threads")


if local_llm_enabled():
    configure_torch_cpu_threads()
coach_llm = create_local_engine()
model_lock = asyncio.Lock()
feedback_settings = FeedbackSettings(Path(os.getenv("ENGLISH_DATA_DIR", str(Path(__file__).resolve().parent.parent / "data"))), coach_llm.model_id, local_enabled=local_llm_enabled())
feedback_service = FeedbackService(coach_llm, model_lock)
reading_service = ReadingService(feedback_service)
listening_service = ListeningService(feedback_service)
writing_service = WritingService(feedback_service)
coach_warmup_lock = Lock()


def ensure_coach_warmup_started(force: bool = False) -> None:
    if not local_llm_enabled():
        return
    if coach_llm.model_loaded and not force:
        return

    if coach_warmup_lock.locked():
        return

    def target() -> None:
        with coach_warmup_lock:
            coach_start = time.perf_counter()
            try:
                coach_llm.warmup(force=force)
            except Exception:
                logger.exception("Coach LLM warmup failed during background startup")
            finally:
                logger.info(
                    "Post-warmup coach diagnostics: %s elapsed=%.2fs",
                    coach_llm.get_status(),
                    time.perf_counter() - coach_start,
                )

    Thread(target=target, daemon=True).start()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("English model service starting")
    logger.info("Initial coach diagnostics: %s", coach_llm.get_status())
    if os.getenv("ENGLISH_LAZY_LOCAL_LLM") != "1":
        ensure_coach_warmup_started()
    yield
    logger.info("English model service shutting down")


app = FastAPI(
    title="English Learning Model Service",
    version="0.1.0",
    description="FastAPI service for local AI coach turns.",
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
    if not local_llm_enabled():
        return {"service": "language", "sourceRoot": os.path.dirname(os.path.abspath(__file__)),
                **coach_llm.get_status(), "ready": True, "provider": "external-api",
                "llmTransport": "application-chat-completions-v1",
                "model": None, "message": "External API language service is ready. Configure a provider before generating content."}
    if not coach_llm.model_loaded and os.getenv("ENGLISH_LAZY_LOCAL_LLM") != "1":
        ensure_coach_warmup_started(force=True)

    status = coach_llm.get_status()
    return {
        "service": "language",
        "sourceRoot": os.path.dirname(os.path.abspath(__file__)),
        "ready": status["coachReady"],
        "provider": "local-coach",
        "model": status["coachModel"],
        "message": "AI Coach is ready through the local coach model."
        if status["coachReady"]
        else f"AI Coach is warming up: {status['coachLoadError'] or ('loading ' + str(status['coachModel']))}",
        **status,
    }


@app.get("/coach-status")
async def coach_status() -> dict[str, object]:
    return await health()


@app.post("/coach-turn")
async def coach_turn(payload: dict[str, object]) -> dict[str, object]:
    logger.info(
        "Coach turn request received action=%s topic=%s history=%s",
        payload.get("action"),
        payload.get("topic"),
        len(payload.get("history") or []) if isinstance(payload.get("history"), list) else 0,
    )

    try:
        async with model_lock:
            result = await run_in_threadpool(coach_llm.generate_turn, payload)
    except RuntimeError as exc:
        logger.exception("Coach turn failed with runtime error")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        logger.exception("Coach turn failed with value error")
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    logger.info(
        "Coach turn response provider=%s model=%s checkpoint=%s",
        result.get("provider"),
        result.get("model"),
        result.get("turn", {}).get("checkpoint") if isinstance(result.get("turn"), dict) else None,
    )
    return result


def require_feedback_access(request: Request) -> None:
    expected = "Bearer " + feedback_settings.token
    if not hmac.compare_digest(request.headers.get("authorization", ""), expected):
        raise HTTPException(status_code=403, detail="Use the application settings page.")


@app.get("/feedback-settings")
async def get_feedback_settings(request: Request, user_id: str):
    require_feedback_access(request)
    return feedback_settings.public(feedback_settings.read(user_id))


@app.post("/feedback-settings")
async def set_feedback_settings(request: Request, payload: dict):
    require_feedback_access(request)
    try:
        saved = feedback_settings.save(payload.get("userId"), payload)
        if saved["provider"] == "local":
            ensure_coach_warmup_started()
        return saved
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


@app.post("/coach-feedback")
async def coach_feedback(request: Request, payload: dict):
    require_feedback_access(request)
    try:
        settings = feedback_settings.read(payload.get("userId"))
        if payload.get("action") == "test":
            text = await feedback_service.generate_text(settings, [{"role": "user", "content": "Reply with exactly: Connection OK"}], test=True)
            if not text.strip():
                raise RuntimeError("Model returned an empty response.")
            return {"ok": True, "message": "模型连接成功，可以生成辅导评论。"}
        return await feedback_service.review(settings, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None
    except Exception as exc:
        # Never log API response bodies or credentials.
        code = str(getattr(exc, "code", ""))
        messages = {"unauthorized": "API key was rejected. Check your credentials.",
                    "rate_limited": "API rate limit reached. Please retry later.",
                    "deadline_exceeded": "Model request timed out. Please retry.",
                    "not_found": "API endpoint or model was not found. Check Base URL and model name."}
        raise HTTPException(status_code=502, detail=messages.get(code, "Model request failed. Check the model settings and API connection.")) from None


@app.post("/reading-generate")
@app.post("/reading-questions")
async def reading_generate(request: Request, payload: dict):
    require_feedback_access(request)
    try:
        settings = feedback_settings.read(payload.get("userId"))
        return await (reading_service.questions(settings, payload) if request.url.path.endswith("reading-questions") else reading_service.generate(settings, payload))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    except Exception:
        raise HTTPException(status_code=502, detail="阅读生成失败，请检查模型设置和 API 连接后重试。") from None


@app.post("/listening-generate")
@app.post("/listening-discuss")
async def listening_request(request: Request, payload: dict):
    require_feedback_access(request)
    try:
        settings = feedback_settings.read(payload.get("userId"))
        if request.url.path.endswith("discuss"):
            return await listening_service.discuss(settings, payload)
        return await listening_service.generate(settings, payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    except Exception:
        raise HTTPException(status_code=502, detail="听力模型请求失败，请检查模型设置和 API 连接后重试。") from None


@app.post("/writing-review")
@app.post("/writing-prompt")
async def writing_request(request: Request, payload: dict):
    require_feedback_access(request)
    try:
        settings = feedback_settings.read(payload.get("userId"))
        if request.url.path.endswith("prompt"):
            return await writing_service.prompt(settings, payload)
        return await writing_service.review(settings, payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    except Exception:
        raise HTTPException(status_code=502, detail="写作模型请求失败，请检查全局模型设置及 API 连接。") from None


@app.get("/global-model-status")
async def global_model_status(request: Request, user_id: str):
    require_feedback_access(request)
    settings = feedback_settings.read(user_id)
    if settings["provider"] == "local":
        if not local_llm_enabled():
            return {"ready": False, "message": "Local LLM is disabled. Configure an external API in model settings."}
        if not coach_llm.model_loaded:
            ensure_coach_warmup_started()
        ready = coach_llm.model_loaded
        return {"ready": ready, "message": "本地语言模型已就绪。" if ready else "本地语言模型正在预热。"}
    ready = bool(settings.get("encryptedKey"))
    if not ready and not local_llm_enabled():
        return {"ready": False, "message": "请在设置 → 全局语言模型中填写 API Key。"}
    return {"ready": ready, "message": f"全局外部模型：{settings['model']}。" if ready else "请在设置 → 全局语言模型中填写 API Key，或切换到本地模型。"}


@app.post("/global-coach-turn")
@app.post("/global-just-speak")
async def global_generation(request: Request, payload: dict):
    require_feedback_access(request)
    try:
        settings = feedback_settings.read(payload.get("userId"))
        if request.url.path.endswith("just-speak"):
            return await generate_global_just_speak(feedback_service, settings, payload)
        return await generate_global_coach(feedback_service, settings, payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    except Exception:
        raise HTTPException(status_code=502, detail="全局模型请求失败，请检查模型设置及连接后重试。") from None


@app.post("/vocabulary-import-preview")
async def vocabulary_import_preview(request: Request, file: UploadFile = File(...)):
    require_feedback_access(request)
    try:
        content = await file.read(512 * 1024 * 1024 + 1)
        return await run_in_threadpool(preview_import, content, file.filename or "")
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    finally:
        await file.close()


@app.post("/vocabulary-explain")
async def vocabulary_explain(request: Request, payload: dict):
    require_feedback_access(request)
    try:
        return await explain_word(feedback_service, feedback_settings.read(payload.get("userId")), payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    except Exception:
        raise HTTPException(status_code=502, detail="单词释义生成失败，请检查全局模型设置。") from None


@app.post("/phrase-learning")
async def phrase_learning_request(request: Request, payload: dict):
    require_feedback_access(request)
    try:
        return await phrase_learning(feedback_service, feedback_settings.read(payload.get("userId")), payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    except Exception:
        raise HTTPException(status_code=502, detail="搭配辅导暂不可用，请检查全局模型设置。") from None


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("COACH_ENGINE_HOST", "0.0.0.0"),
        port=int(os.getenv("COACH_ENGINE_PORT", "8001")),
        log_config=None,
    )
