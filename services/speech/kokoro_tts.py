"""Offline Kokoro synthesis; one shared model, selectable English voices."""
from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
from threading import RLock
import time
from uuid import uuid4

from speech_text import classify_tts_mode, normalize_narration_text, normalize_reference_word_text
from tts_config import read_settings, selected_voice, voice_options

ARPA = dict(AA='ɑ', AE='æ', AH='ʌ', AO='ɔ', AW='W', AY='I', B='b', CH='ʧ', D='d', DH='ð',
            EH='ɛ', ER='ɜɹ', EY='A', F='f', G='ɡ', HH='h', IH='ɪ', IY='i', JH='ʤ', K='k',
            L='l', M='m', N='n', NG='ŋ', OW='O', OY='Y', P='p', R='ɹ', S='s', SH='ʃ', T='t',
            TH='θ', UH='ʊ', UW='u', V='v', W='w', Y='j', Z='z', ZH='ʒ')


def lexical_phonemes(pronunciation):
    tokens = pronunciation.split()
    if not tokens or len(tokens) > 80:
        raise ValueError('Invalid lexical pronunciation.')
    output = []
    for token in tokens:
        base = token.rstrip('012')
        if base not in ARPA or token not in {base, base + '0', base + '1', base + '2'}:
            raise ValueError('Invalid ARPAbet token.')
        stress = 'ˈ' if token.endswith('1') else 'ˌ' if token.endswith('2') else ''
        output.append(stress + ('ə' if token == 'AH0' else ARPA[base]))
    return ''.join(output)


class KokoroSpeechSynthesizer:
    provider_label = 'kokoro'
    model_name = 'Kokoro-82M'

    def __init__(self):
        self.settings = read_settings()
        self.model_loaded = False
        self.load_error = None
        self.device_label = 'not-loaded'
        self.last_warmup_seconds = None
        self.last_generation_seconds = None
        self._model = None
        self._pipelines = {}
        self._lock = RLock()
        self.cache = Path(self.settings['artifact_directory'])
        self.cache.mkdir(parents=True, exist_ok=True)

    def selected_voice(self):
        return selected_voice(self.settings)

    def voice_options(self):
        return voice_options(self.settings)

    def warmup(self, force=False):
        with self._lock:
            if self.model_loaded and not force:
                return
            start = time.perf_counter()
            try:
                import torch
                import espeakng_loader
                from phonemizer.backend.espeak.wrapper import EspeakWrapper
                EspeakWrapper.set_library(espeakng_loader.get_library_path())
                EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
                from kokoro import KModel, KPipeline
                directory = Path(self.settings['model_dir'])
                device = os.environ.get('ENGLISH_TTS_DEVICE', self.settings.get('device', 'auto'))
                self.device_label = ('cuda' if torch.cuda.is_available() else 'cpu') if device == 'auto' else device
                self._model = KModel(repo_id='hexgrad/Kokoro-82M', config=str(directory / 'config.json'),
                                     model=str(directory / 'kokoro-v1_0.pth')).to(self.device_label).eval()
                self._pipelines = {code: KPipeline(lang_code=code, model=self._model, repo_id='hexgrad/Kokoro-82M')
                                   for code in {voice['voice']['lang_code'] for voice in self.settings['voices'].values()}}
                self.model_loaded = True
                self.load_error = None
            except Exception as error:
                self.model_loaded = False
                self.load_error = str(error)
                raise RuntimeError('Kokoro could not load its local model or English resources: ' + str(error)) from error
            finally:
                self.last_warmup_seconds = round(time.perf_counter() - start, 3)

    def synthesize(self, text, instruct=None, voice_id=None, pronunciation=None):
        word = classify_tts_mode(text) == 'word'
        normalized = normalize_reference_word_text(text) if word else normalize_narration_text(text)
        if not normalized or len(normalized) > 2000:
            raise ValueError('Enter between 1 and 2000 characters for reference audio.')
        voice_id = voice_id or self.selected_voice()
        if voice_id not in self.settings['voices']:
            raise ValueError('Choose an installed Kokoro voice.')
        voice = self.settings['voices'][voice_id]['voice']
        phones = lexical_phonemes(pronunciation) if pronunciation else None
        directory = Path(self.settings['model_dir'])
        paths = [directory / 'kokoro-v1_0.pth', directory / 'config.json', Path(voice['voice_file'])]
        identity = [(str(path), path.stat().st_size, path.stat().st_mtime_ns) for path in paths]
        key = hashlib.sha256(json.dumps(['kokoro-v1', normalized, phones, voice_id, self.settings['speed'], identity]).encode()).hexdigest()
        path = self.cache / (key + '.wav')
        with self._lock:
            if path.exists():
                return path.read_bytes()
            self.warmup()
            started = time.perf_counter()
            try:
                import numpy as np
                import soundfile as sf
                import torch
                parts = []
                with torch.inference_mode():
                    pipeline = self._pipelines[voice['lang_code']]
                    generator = pipeline.generate_from_tokens(phones, voice=voice['voice_file'], speed=self.settings['speed']) if phones else pipeline(normalized, voice=voice['voice_file'], speed=self.settings['speed'])
                    for _, _, audio in generator:
                        if audio is not None and len(audio):
                            if parts:
                                parts.append(np.zeros(2880, dtype=np.float32))
                            parts.append(audio.detach().cpu().numpy().astype(np.float32))
                if not parts:
                    raise RuntimeError('Kokoro returned no audio.')
                buffer = io.BytesIO()
                sf.write(buffer, np.concatenate(parts), 24000, format='WAV', subtype='PCM_16')
                result = buffer.getvalue()
                temporary = path.with_suffix('.' + uuid4().hex + '.tmp')
                try:
                    temporary.write_bytes(result)
                    temporary.replace(path)
                finally:
                    temporary.unlink(missing_ok=True)
                self.load_error = None
                return result
            finally:
                self.last_generation_seconds = round(time.perf_counter() - started, 3)

    def get_status(self):
        return {'ttsModel': self.model_name, 'ttsProvider': self.provider_label, 'ttsLanguage': 'English',
                'ttsInstruct': '', 'ttsReady': self.model_loaded, 'ttsLoadError': self.load_error,
                'ttsImportError': None, 'ttsDevice': self.device_label, 'ttsFallbackActive': False,
                'ttsRequiresModelProvider': True, 'ttsLastWarmupSeconds': self.last_warmup_seconds,
                'ttsLastGenerationSeconds': self.last_generation_seconds}
