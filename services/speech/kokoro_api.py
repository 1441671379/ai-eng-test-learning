"""Dedicated TTS worker using the same Python environment as speech assessment."""
from contextlib import asynccontextmanager
import logging
from threading import Thread

from fastapi import FastAPI, Form, HTTPException
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from kokoro_tts import KokoroSpeechSynthesizer

synthesizer = KokoroSpeechSynthesizer()


@asynccontextmanager
async def lifespan(app):
    def load():
        try:
            synthesizer.warmup()
        except Exception:
            logging.exception('Kokoro warmup failed')
    Thread(target=load, daemon=True).start()
    yield


app = FastAPI(title='English Learning Kokoro TTS', lifespan=lifespan)


@app.get('/health')
def health():
    return synthesizer.get_status()


@app.post('/reference-audio')
def reference_audio(text: str = Form(...), voice_id: str = Form(default=''), instruct: str = Form(default=''), pronunciation: str = Form(default='')):
    try:
        voice_id = voice_id or synthesizer.selected_voice()
        audio = synthesizer.synthesize(text, voice_id=voice_id, pronunciation=pronunciation or None)
        return Response(audio, media_type='audio/wav', headers={'X-TTS-Engine': 'kokoro', 'X-TTS-Voice': voice_id, 'Cache-Control': 'no-store'})
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        logging.exception('Kokoro synthesis failed')
        raise HTTPException(503, 'Kokoro synthesis failed; check the local TTS log.') from error
