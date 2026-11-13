"""Wrap one verified Inno distribution in ordinary, size-limited download ZIPs."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LIMIT = 2 * 1024**3


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        while block := stream.read(4 * 1024**2):
            value.update(block)
    return value.hexdigest()


def main():
    release = json.loads((HERE / 'dist/latest.json').read_text(encoding='utf-8'))
    source = Path(release['output'])
    payload = json.loads((Path(release['source']) / 'resources/bundle-manifest.json').read_text(encoding='utf-8'))
    assert payload['publicResourcesOnly'] and not payload['coursePackIncluded']
    assert payload['localLlmIncluded'] is False and payload['privateDataIncluded'] is False
    for item in release['artifacts']:
        path = source / item['file']
        assert path.stat().st_size == item['bytes'] and digest(path) == item['sha256'], item['file']
    bins = sorted(source.glob('files/*.bin'))
    if len(bins) != 2:
        raise RuntimeError('The documented three-ZIP layout requires exactly two Inno data slices; update the guide for a different count.')
    output = source / 'github'
    output.mkdir(exist_ok=False)
    regular = [p for p in source.rglob('*') if p.is_file() and not p.is_relative_to(output) and p.suffix != '.bin']
    groups = [regular, [bins[0]], [bins[1]]]
    artifacts = []
    prefix = f"EnglishLearning-{release['version']}-Windows-x64"
    for number, files in enumerate(groups, 1):
        name = f"{prefix}-{number}-{'Setup' if number == 1 else 'Data'}.zip"
        target = output / name
        # Inno's .bin files are already compressed; storing also permits native
        # Windows ZIP extraction without a split-archive utility.
        with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
            for path in sorted(files):
                archive.write(path, path.relative_to(source).as_posix())
        assert target.stat().st_size < LIMIT, name
        with zipfile.ZipFile(target) as archive:
            assert archive.testzip() is None, name
        artifacts.append({'file': name, 'bytes': target.stat().st_size, 'sha256': digest(target)})
        print(json.dumps(artifacts[-1]), flush=True)
    (output / 'SHA256SUMS.txt').write_text(''.join(f"{a['sha256']}  {a['file']}\n" for a in artifacts), encoding='utf-8')
    shutil.copy2(ROOT / 'docs/QUICKSTART.md', output / 'INSTALL.txt')
    (output / 'DOWNLOADS.json').write_text(json.dumps({'version': release['version'], 'artifacts': artifacts}, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(output), 'totalBytes': sum(a['bytes'] for a in artifacts), 'zipCount': len(artifacts)}), flush=True)


if __name__ == '__main__':
    main()
