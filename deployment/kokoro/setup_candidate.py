"""Recreate the shared Kokoro/speech environment from the locked dependencies."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-source', type=Path, required=True)
    args = parser.parse_args()
    candidate = ROOT / 'runtimes/inference-kokoro'
    if not candidate.exists():
        print('Creating shared Kokoro inference environment...', flush=True)
        subprocess.run([sys.executable, '-m', 'venv', str(candidate)], check=True)
    python = candidate / 'Scripts/python.exe'
    subprocess.run([str(python), '-m', 'pip', 'install', '--extra-index-url', 'https://download.pytorch.org/whl/cu128',
                    '-r', str(Path(__file__).with_name('requirements.lock.txt'))], check=True)
    model = Path(__file__).with_name('models')
    model.mkdir(exist_ok=True)
    files = ['config.json', 'kokoro-v1_0.pth', 'README.md', 'VOICES.md', 'download-manifest.json']
    files += ['voices/' + voice + '.pt' for voice in ('af_heart', 'am_puck', 'bf_emma', 'bm_george')]
    manifest = []
    for name in files:
        source, dest = args.model_source / name, model / name
        dest.parent.mkdir(exist_ok=True)
        shutil.copy2(source, dest)
        manifest.append({'path': name, 'bytes': dest.stat().st_size, 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
    Path(__file__).with_name('assets.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    freeze = subprocess.check_output([str(python), '-m', 'pip', 'freeze'], text=True)
    Path(__file__).with_name('requirements.lock.txt').write_text(freeze, encoding='utf-8')
    print('Shared Kokoro inference environment installed.', flush=True)


if __name__ == '__main__':
    main()
