"""Real offline synthesis and assessment acceptance, isolated from learner data."""
import argparse
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import wave

ROOT = Path(__file__).resolve().parents[2]
QA = Path(__file__).with_name('qa')
TEXT = 'Learning a new language opens the door to a world of ideas.'


def score(output):
    os.environ.update(HF_HOME=str(ROOT / 'models'), HF_HUB_OFFLINE='1', TOKENIZERS_PARALLELISM='false')
    sys.path.insert(0, str(ROOT / 'services/speech'))
    import torch
    torch.set_num_threads(4)
    import espeakng_loader
    from phonemizer.backend.espeak.wrapper import EspeakWrapper
    EspeakWrapper.set_library(espeakng_loader.get_library_path())
    EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
    from phoneme_scorer import PhonemeScorer, MODEL_NAME, _phonemize_target_phrase
    from speech_transcriber import SpeechTranscriber
    from time_first_service import TimeFirstService
    scorer, transcriber = PhonemeScorer(model_name=MODEL_NAME), SpeechTranscriber()
    service = TimeFirstService(scorer, transcriber)
    service.word_timer.warmup()
    scorer.warmup()
    transcriber.warmup()
    before = time.perf_counter()
    result = service.analyze((QA / 'sentence.wav').read_bytes(), TEXT, filename='sentence.wav')
    output.write_text(json.dumps({'elapsedSeconds': time.perf_counter() - before,
        'targets': {text: _phonemize_target_phrase(text)['ipa'] for text in [TEXT, 'notice', 'economics', 'read the book']},
        'result': result}, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Assessment report:', output, flush=True)


def synthesize():
    import httpx
    QA.mkdir(exist_ok=True)
    settings = json.loads(Path(__file__).with_name('settings.json').read_text(encoding='utf-8'))
    base = Path(__file__).parent
    for key in ('model_dir', 'selection_file'):
        settings[key] = str(base / settings[key])
    for entry in settings['voices'].values():
        entry['voice']['voice_file'] = str(base / entry['voice']['voice_file'])
    settings.update(endpoint='http://127.0.0.1:18981', artifact_directory=str(QA / 'cache'))
    config = QA / 'settings.json'
    config.write_text(json.dumps(settings), encoding='utf-8')
    env = {**os.environ, 'ENGLISH_TTS_CONFIG': str(config), 'ENGLISH_TTS_PROVIDER': 'kokoro',
           'ENGLISH_TTS_PORT': '18981', 'ENGLISH_CPU_THREADS': '4'}
    with (QA / 'tts.log').open('w', encoding='utf-8') as log:
        process = subprocess.Popen([sys.executable, str(ROOT / 'services/launch.py'), 'tts'], cwd=ROOT,
                                   env=env, stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            with httpx.Client(timeout=180, trust_env=False) as client:
                deadline = time.monotonic() + 180
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        raise RuntimeError('Kokoro worker exited; see qa/tts.log')
                    try:
                        status = client.get(settings['endpoint'] + '/health', timeout=2).json()
                        if status.get('ttsLoadError'):
                            raise RuntimeError(status['ttsLoadError'])
                        if status.get('ttsReady'):
                            break
                    except httpx.TransportError:
                        pass
                    time.sleep(.5)
                else:
                    raise RuntimeError('Kokoro worker did not become ready')
                report = {'health': status, 'cases': []}
                cases = [(voice, TEXT) for voice in settings['voices']]
                cases += [('af_heart', 'economics'), ('af_heart',
                    'Macroeconomics studies the economy as a whole. Inflation means that the general price level rises over time. '
                    'For example, a family may notice that the same basket of groceries costs more than it did last year. '
                    'Central banks may adjust interest rates to influence spending and investment. '
                    'However, policymakers must also consider employment and long-term growth.')]
                for index, (voice, text) in enumerate(cases):
                    start = time.perf_counter()
                    response = client.post(settings['endpoint'] + '/reference-audio', data={'text': text, 'voice_id': voice})
                    response.raise_for_status()
                    assert response.headers['x-tts-engine'] == 'kokoro'
                    with wave.open(io.BytesIO(response.content)) as wav:
                        assert wav.getnchannels() == 1 and wav.getsampwidth() == 2
                        duration = wav.getnframes() / wav.getframerate()
                        assert duration > .1
                        rate = wav.getframerate()
                    path = QA / ('sentence.wav' if index == 0 else f'{index}-{voice}.wav')
                    path.write_bytes(response.content)
                    report['cases'].append({'voice': voice, 'text': text, 'sampleRate': rate,
                        'audioSeconds': duration, 'generationSeconds': time.perf_counter() - start})
                    print(report['cases'][-1], flush=True)
                start = time.perf_counter()
                cached = client.post(settings['endpoint'] + '/reference-audio', data={'text': TEXT, 'voice_id': 'af_heart'})
                assert cached.content == (QA / 'sentence.wav').read_bytes()
                report['cachedSeconds'] = time.perf_counter() - start
                invalid = client.post(settings['endpoint'] + '/reference-audio', data={'text': TEXT, 'voice_id': '../../bad'})
                assert invalid.status_code == 400
                variants = []
                for name, phones in [('read-present', 'R IY1 D'), ('read-past', 'R EH1 D')]:
                    response = client.post(settings['endpoint'] + '/reference-audio', data={'text': 'read', 'voice_id': 'af_heart', 'pronunciation': phones})
                    response.raise_for_status()
                    (QA / (name + '.wav')).write_bytes(response.content)
                    variants.append(response.content)
                assert variants[0] != variants[1], 'lexical alternatives must produce different audio'
                report['lexicalVariants'] = ['read /riːd/', 'read /red/']
                (QA / 'synthesis.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        finally:
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--score', type=Path)
    args = parser.parse_args()
    if args.score:
        score(args.score)
    else:
        synthesize()
