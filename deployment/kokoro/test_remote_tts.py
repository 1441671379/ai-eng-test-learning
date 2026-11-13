import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs
import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'services/speech'))
from remote_tts import RemoteKokoroSynthesizer


class RemoteTests(unittest.TestCase):
    def setUp(self):
        settings = {'endpoint': 'http://localhost:18981', 'default_voice': 'af_heart',
                    'selection_file': str(ROOT / 'deployment/kokoro/qa/missing-selection.json'), 'voices': {}}
        with patch('remote_tts.read_settings', return_value=settings):
            self.synth = RemoteKokoroSynthesizer()

    def client(self, handler):
        return patch('remote_tts.httpx.Client', return_value=httpx.Client(transport=httpx.MockTransport(handler)))

    def test_voice_and_lexical_pronunciation_forwarding(self):
        def handler(request):
            data = parse_qs(request.content.decode())
            self.assertEqual(data['voice_id'], ['am_puck'])
            self.assertEqual(data['pronunciation'], ['R EH1 D'])
            return httpx.Response(200, content=b'RIFF-audio', headers={'x-tts-engine': 'kokoro'})
        with self.client(handler):
            self.assertEqual(self.synth.synthesize('read', voice_id='am_puck', pronunciation='R EH1 D'), b'RIFF-audio')

    def test_wrong_engine_is_never_silently_accepted(self):
        with self.client(lambda _: httpx.Response(200, content=b'old', headers={'x-tts-engine': 'gpt-sovits'})):
            with self.assertRaises(RuntimeError):
                self.synth.synthesize('hello')
        self.assertFalse(self.synth.model_loaded)

    def test_interrupted_connection_uses_service_error_contract(self):
        def handler(request):
            raise httpx.ReadTimeout('test interruption', request=request)
        with self.client(handler):
            with self.assertRaises(RuntimeError):
                self.synth.synthesize('hello')
        self.assertFalse(self.synth.model_loaded)

    def test_invalid_voice_stays_a_validation_error(self):
        with self.client(lambda _: httpx.Response(400, json={'detail': 'Invalid voice'})):
            with self.assertRaises(ValueError):
                self.synth.synthesize('hello', voice_id='../bad')


if __name__ == '__main__':
    unittest.main()
