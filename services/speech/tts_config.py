"""Provider configuration shared by local synthesis and its HTTP client."""
import json
import os
from pathlib import Path


def config_path():
    root = Path(os.environ.get('ENGLISH_APP_ROOT', Path(__file__).resolve().parents[2]))
    explicit = os.environ.get('ENGLISH_TTS_CONFIG')
    return Path(explicit) if explicit else root / 'deployment/kokoro/settings.json'


def read_settings():
    path = config_path().resolve()
    settings = json.loads(path.read_text(encoding='utf-8-sig'))
    if settings.get('provider', 'kokoro') != 'kokoro':
        raise ValueError('This application uses Kokoro for all speech synthesis.')
    for key in ('model_dir', 'artifact_directory', 'selection_file'):
        if settings.get(key):
            settings[key] = str((path.parent / settings[key]).resolve())
    for entry in settings.get('voices', {}).values():
        if entry.get('voice', {}).get('voice_file'):
            entry['voice']['voice_file'] = str((path.parent / entry['voice']['voice_file']).resolve())
    return settings


def selected_voice(settings):
    default = settings.get('default_voice', 'af_heart')
    try:
        saved = json.loads(Path(settings['selection_file']).read_text(encoding='utf-8-sig'))
        return saved['voiceId'] if saved.get('voiceId') in settings['voices'] else default
    except FileNotFoundError:
        return default


def voice_options(settings):
    return {'provider': 'kokoro', 'selectedVoiceId': selected_voice(settings),
            'voices': [{'id': key, 'label': item['label'], 'version': item['version']}
                       for key, item in settings['voices'].items()]}
