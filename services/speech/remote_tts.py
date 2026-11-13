"""Speech-service adapter for the independent Kokoro worker."""
import httpx
from tts_config import read_settings, selected_voice, voice_options


class RemoteKokoroSynthesizer:
    provider_label = 'kokoro'
    device_label = 'shared-service'

    def __init__(self):
        self.settings = read_settings()
        self.model_loaded = False
        self._status = {}

    def selected_voice(self):
        return selected_voice(self.settings)

    def voice_options(self):
        return voice_options(self.settings)

    def warmup(self, force=False):
        try:
            with httpx.Client(timeout=10, trust_env=False) as client:
                response = client.get(self.settings['endpoint'].rstrip('/') + '/health')
                response.raise_for_status()
                self._status = response.json()
                self.model_loaded = self._status.get('ttsReady') is True
                self.device_label = self._status.get('ttsDevice', 'shared-service')
                if not self.model_loaded:
                    raise RuntimeError(self._status.get('ttsLoadError') or 'Kokoro is still loading. Please retry shortly.')
        except httpx.HTTPError as error:
            self.model_loaded = False
            raise RuntimeError('Kokoro service is unavailable. Restart the local speech services.') from error

    def synthesize(self, text, instruct=None, voice_id=None, pronunciation=None):
        try:
            with httpx.Client(timeout=200, trust_env=False) as client:
                response = client.post(self.settings['endpoint'].rstrip('/') + '/reference-audio',
                                       data={'text': text, 'voice_id': voice_id or self.selected_voice(), 'pronunciation': pronunciation or ''})
                if response.status_code == 400:
                    raise ValueError(response.json().get('detail', 'Invalid synthesis request.'))
                if not response.is_success or response.headers.get('x-tts-engine') != 'kokoro':
                    self.model_loaded = False
                    raise RuntimeError('Kokoro synthesis is unavailable. Check the local TTS service.')
                self.model_loaded = True
                return response.content
        except httpx.HTTPError as error:
            self.model_loaded = False
            raise RuntimeError('Kokoro synthesis was interrupted. Please retry.') from error

    def get_status(self):
        return {**self._status, 'ttsModel': 'Kokoro-82M', 'ttsProvider': 'kokoro',
                'ttsReady': self.model_loaded, 'ttsDevice': self.device_label}
