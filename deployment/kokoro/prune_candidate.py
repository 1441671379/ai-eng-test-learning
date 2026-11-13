"""Remove GPT-SoVITS-only distributions from the disposable Kokoro candidate."""
import importlib.metadata as metadata
import json
from pathlib import Path
import subprocess
import sys
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = ROOT / 'runtimes/inference-kokoro'
if Path(sys.prefix).resolve() != EXPECTED.resolve():
    raise SystemExit('Run only with the independent inference-kokoro Python.')
roots = ['kokoro', 'misaki[en]', 'en-core-web-sm', 'torch', 'torchaudio', 'transformers',
         'accelerate', 'fastapi', 'uvicorn', 'httpx', 'python-multipart', 'soundfile',
         'scipy', 'numpy', 'imageio-ffmpeg', 'zstandard', 'pip', 'setuptools']
active = {}
queue = [Requirement(root) for root in roots]
while queue:
    requirement = queue.pop()
    key = canonicalize_name(requirement.name)
    extras = {''} | requirement.extras
    previous = active.get(key, set())
    if key in active and extras <= previous:
        continue
    active[key] = previous | extras
    distribution = metadata.distribution(key)
    for text in distribution.requires or []:
        child = Requirement(text)
        if child.marker is None or any(child.marker.evaluate({'extra': extra}) for extra in active[key]):
            queue.append(child)
installed = {canonicalize_name(item.metadata['Name']) for item in metadata.distributions()}
removed = sorted(installed - active.keys())
print('Removing unused candidate distributions:', ', '.join(removed), flush=True)
if removed:
    subprocess.run([sys.executable, '-m', 'pip', 'uninstall', '-y', *removed], check=True)
for wheel in (EXPECTED / 'Lib/site-packages').glob('*.whl'):
    wheel.unlink()
# Copied Windows console launchers embed the old Python path. Regenerate them
# from the retained package metadata so CLI tools cannot mutate the control.
from pip._vendor.distlib.scripts import ScriptMaker
maker = ScriptMaker(None, str(EXPECTED / 'Scripts'))
maker.executable = sys.executable
maker.clobber = True
maker.variants = {''}
for distribution in metadata.distributions():
    for entry in distribution.entry_points:
        if entry.group in ('console_scripts', 'gui_scripts'):
            maker.make(f'{entry.name} = {entry.value}', options={'gui': entry.group == 'gui_scripts'})
subprocess.run([sys.executable, '-m', 'pip', 'check'], check=True)
folder = Path(__file__).parent
(folder / 'requirements.lock.txt').write_text(subprocess.check_output([sys.executable, '-m', 'pip', 'freeze'], text=True), encoding='utf-8')
record = folder / 'dependency-pruning.json'
previous = json.loads(record.read_text(encoding='utf-8')).get('removed', []) if record.exists() else []
record.write_text(json.dumps({'roots': roots, 'removed': sorted(set(previous) | set(removed)), 'kept': sorted(active)}, indent=2), encoding='utf-8')
