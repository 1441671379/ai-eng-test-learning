"""Assemble an independent Windows desktop directory from an explicit allowlist.

No local LLM, original environments, personal profile, model junctions, or old
application bundles are included. --refresh updates UI/services without recopying
the immutable inference runtime and model files.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
BUILD = HERE / "build"
APP = BUILD / "EnglishLearning"
RES = APP / "resources"
TTS_RUNTIME_FILE = ROOT / 'deployment/tts/runtime.json'
TTS_RUNTIME = json.loads(TTS_RUNTIME_FILE.read_text(encoding='utf-8-sig'))
if TTS_RUNTIME['provider'] != 'kokoro':
    raise RuntimeError('Only the Kokoro speech runtime is supported')
VOICES = tuple(json.loads((ROOT / TTS_RUNTIME['config']).read_text(encoding='utf-8'))['voices'])
SKIP = {"__pycache__", ".git", ".pytest_cache", ".mypy_cache", ".DS_Store"}
COUNTS = {"files": 0, "bytes": 0}
PUBLIC_RELEASE = False
ASSET_ROOT = ROOT


def copy(src: Path, dst: Path, *, skip=frozenset(), missing=False):
    if src.name in SKIP or src.name in skip or src.suffix in {".pyc", ".pyo"}:
        return
    if src.name.startswith((".env", "__editable__", "~")):
        return
    if src.is_dir():
        dst.mkdir(parents=True, exist_ok=True)
        for child in src.iterdir():
            copy(child, dst / child.name, skip=skip, missing=missing)
        return
    if missing and dst.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    # Materialize links as ordinary copies; never share writable files with dev.
    shutil.copy2(src.resolve(strict=True), dst)
    COUNTS["files"] += 1
    COUNTS["bytes"] += src.stat().st_size


def remove_generated(path: Path):
    resolved = path.resolve()
    if not resolved.is_relative_to(RES.resolve()) or resolved == RES.resolve():
        raise RuntimeError("Refusing to remove outside generated resources: " + str(resolved))
    if path.is_symlink() or (path.exists() and path.lstat().st_file_attributes & 0x400):
        raise RuntimeError("Refusing to remove a generated reparse point: " + str(path))
    if path.exists():
        shutil.rmtree(path)


def write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def ui_and_services():
    print("Preparing Electron shell, production UI and application services", flush=True)
    for cache in list((RES / 'runtime/python').rglob('__pycache__')):
        remove_generated(cache)
    shell = ROOT / "apps/desktop/windows"
    for item in shell.iterdir():
        if item.is_file() and not item.name.endswith((".test.cjs", ".test.js", ".test.ts")):
            copy(item, RES / "app" / item.name)
    standalone = ROOT / "apps/web/.next/standalone"
    if not (standalone / "server.js").exists():
        raise RuntimeError("Run pnpm --dir apps/web build first")
    web = RES / "app/web"
    remove_generated(web)
    for name in (".next", "server.js", "package.json"):
        copy(standalone / name, web / name, skip={"cache"})
    # pnpm links point outside standalone; copy their contents and flatten only
    # the traced hoisted dependencies, rather than shipping dev node_modules.
    for item in (standalone / "node_modules").iterdir():
        if item.name != ".pnpm":
            copy(item, web / "node_modules" / item.name)
    hoisted = standalone / "node_modules/.pnpm/node_modules"
    if hoisted.exists():
        copy(hoisted, web / "node_modules", missing=True)
    remove_generated(web / "node_modules/.pnpm")
    copy(ROOT / "apps/web/.next/static", web / ".next/static")
    copy(ROOT / "apps/web/public", web / "public")
    for name in ("common", "speech", "language", "data"):
        target = RES / "app/services" / name
        remove_generated(target)
        copy(ROOT / "services" / name, target, skip={"tests"})
    # API-only language service does not import either local inference module.
    for name in ("coach_llm.py", "model.py"):
        (RES / "app/services/language" / name).unlink(missing_ok=True)
    copy(HERE / "windows_service.py", RES / "app/deployment/windows_service.py")
    remove_generated(RES / "app/wordbooks")
    copy(ROOT / "deployment/vocabulary/books", RES / "app/wordbooks")
    remove_generated(RES / "app/deployment/phrases")
    phrase_files = ("NOTICE.md",) if PUBLIC_RELEASE else ("catalog.json", "lessons.json", "courses.json", "NOTICE.md")
    for name in phrase_files:
        copy(ROOT / "deployment/phrases" / name, RES / "app/deployment/phrases" / name)
    manifest = RES / "app/wordbooks/manifest.json"
    books = json.loads(manifest.read_text(encoding="utf-8"))
    if PUBLIC_RELEASE:
        assert {book['id'] for book in books} == {'primary', 'junior', 'senior', 'ielts7', 'ielts85'}
        assert {file.name for file in manifest.parent.glob('*.json')} == {'manifest.json', *(book['id'] + '.json' for book in books)}
    for book in books:
        if book["id"] in {"cet4", "cet6"}:
            book["name"] = "大学英语" + ("四级" if book["id"] == "cet4" else "六级")
            book["sources"] = ["用户提供的 Anki 词书"]
    write(manifest, books)
    # Public reference data is independent of per-learner SQLite databases.
    dictionary = ASSET_ROOT / "deployment/dictionary"
    for name in ("ecdict.sqlite", "manifest.json", "LICENSE.ECDICT.txt"):
        copy(dictionary / name, RES / "app/deployment/dictionary" / name)
    licenses = RES / "licenses"
    copy(dictionary / "LICENSE.ECDICT.txt", licenses / "ECDICT-MIT.txt")
    if PUBLIC_RELEASE:
        remove_generated(RES / "app/deployment/word-audio")
    elif (ROOT / 'deployment/word-audio/manifest.json').exists():
        word_audio_assets()
    word_pronunciation_assets()
    copy(ROOT / "deployment/vocabulary/book-sources", licenses / "wordbook-sources")
    copy(ROOT / "services/speech/LICENSE.cadence", licenses / "speech-upstream-MIT.txt")
    copy(ROOT / "services/language/LICENSE.cadence", licenses / "language-upstream-MIT.txt")
    alignment_license = ROOT / "services/speech/licenses"
    if alignment_license.exists():
        copy(alignment_license, licenses / "alignment")
    copy(ROOT / 'deployment/kokoro/LICENSE.Kokoro.txt', licenses / 'Kokoro-Apache-2.0.txt')
    copy(ROOT / 'deployment/kokoro/LICENSE.Kokoro.txt', licenses / 'Wav2Vec2-phoneme-Apache-2.0.txt')
    if (HERE / 'licenses').is_dir():
        copy(HERE / 'licenses', licenses / 'components')
    copy(RES / 'models/kokoro/README.md', licenses / 'Kokoro-model-card.md')
    copy(ROOT / 'apps/web/LICENSE', licenses / 'frontend-upstream-MIT.txt')
    copy(HERE / "THIRD_PARTY_NOTICES.md", licenses / "THIRD_PARTY_NOTICES.md")
    copy(HERE / "使用说明.txt", APP / "使用说明.txt")


def word_audio_assets():
    """Refresh only public word recordings; do not touch UI, models or profiles."""
    audio_pack = ROOT / "deployment/word-audio"
    destination = RES / "app/deployment/word-audio"
    manifest = json.loads((audio_pack / "manifest.json").read_text(encoding="utf-8"))
    if hashlib.sha256((audio_pack / "catalog.sqlite").read_bytes()).hexdigest() != manifest["catalogSha256"]:
        raise RuntimeError("Source word audio catalog checksum mismatch")
    credits = json.loads((audio_pack / "ATTRIBUTION.json").read_text(encoding="utf-8"))
    for recording in {item["id"]: item for item in credits}.values():
        if not recording.get("bytes"): continue
        identity = recording["id"]
        if len(identity) != 64 or not all(c in "0123456789abcdef" for c in identity):
            raise RuntimeError("Invalid public audio file identity")
        source = audio_pack / "audio" / (identity + ".ogg")
        if hashlib.sha256(source.read_bytes()).hexdigest() != recording["sha256"]:
            raise RuntimeError("Public audio checksum mismatch: " + recording["file"])
        target = destination / "audio" / source.name
        if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != recording["sha256"]:
            copy(source, target)
    for name in ("catalog.sqlite", "ATTRIBUTION.json", "NOTICE.md", "manifest.json"):
        copy(audio_pack / name, destination / name)
    for name in ("ATTRIBUTION.json", "NOTICE.md"):
        copy(audio_pack / name, RES / "licenses/word-audio" / name)


def word_pronunciation_assets():
    source = ROOT / 'deployment/word-pronunciations'
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    if hashlib.sha256((source / 'catalog.json').read_bytes()).hexdigest() != manifest['sha256']:
        raise RuntimeError('Lexical pronunciation catalog checksum mismatch')
    for name in ('catalog.json', 'manifest.json', 'NOTICE.md', 'LICENSE.CMUDICT.txt'):
        copy(source / name, RES / 'app/deployment/word-pronunciations' / name)
        if name.endswith(('.md', '.txt')):
            copy(source / name, RES / 'licenses/word-pronunciations' / name)


def runtime():
    print("Copying one relocatable Python 3.11 / PyTorch candidate", flush=True)
    if sys.version_info[:2] != (3, 11) or os.name != "nt":
        raise RuntimeError("Build with the candidate Windows Python 3.11")
    base = Path(sys.base_prefix)
    target = RES / "runtime/python"
    for name in ("python.exe", "pythonw.exe", "python311.dll", "python3.dll", "vcruntime140.dll", "vcruntime140_1.dll", "LICENSE.txt"):
        if (base / name).exists():
            copy(base / name, target / name)
    copy(base / "DLLs", target / "DLLs")
    for item in (base / "Lib").iterdir():
        if item.name not in {"site-packages", "test", "idlelib", "tkinter", "turtledemo", "ensurepip"}:
            copy(item, target / "Lib" / item.name)
    packages = ROOT / 'runtimes/inference-kokoro/Lib/site-packages'
    remove_generated(target / 'Lib/site-packages')
    copy(packages, target / "Lib/site-packages")
    (target / "python311._pth").write_text(".\nLib\nDLLs\nLib/site-packages\nimport site\n", encoding="utf-8")
    copy(ROOT / "deployment/bin/ffmpeg.exe", RES / "runtime/bin/ffmpeg.exe")
    node = Path(shutil.which("node") or "")
    version = subprocess.check_output([str(node), "--version"], text=True).strip()
    if int(version.lstrip("v").split(".")[0]) < 24:
        raise RuntimeError("Node 24+ required by node:sqlite")
    copy(node, RES / "runtime/node.exe")
    (RES / "runtime/NODE_VERSION.txt").write_text(version, encoding="utf-8")


def models():
    print('Copying speech models and the four-voice Kokoro allowlist', flush=True)
    for repo in ('models--facebook--wav2vec2-xlsr-53-espeak-cv-ft', 'models--openai--whisper-base.en'):
        for name in ('refs', 'snapshots', '.no_exist'):
            source = ROOT / 'models/hub' / repo / name
            if source.exists():
                copy(source, RES / 'models/hub' / repo / name)
    copy(ROOT / 'models/word-alignment', RES / 'models/word-alignment')
    settings_file = ROOT / TTS_RUNTIME['config']
    settings = json.loads(settings_file.read_text(encoding='utf-8'))
    source = settings_file.parent / settings['model_dir']
    for name in ('kokoro-v1_0.pth', 'config.json', 'README.md', 'VOICES.md', 'download-manifest.json'):
        copy(source / name, RES / 'models/kokoro' / name)
    for entry in settings['voices'].values():
        voice = Path(entry['voice']['voice_file'])
        copy(settings_file.parent / voice, RES / 'models/kokoro/voices' / voice.name)
        entry['voice']['voice_file'] = 'models/kokoro/voices/' + voice.name
    settings.update(model_dir='models/kokoro')
    for key in ('selection_file', 'artifact_directory', 'endpoint'):
        settings.pop(key, None)
    write(RES / 'voice-template.json', settings)


def inventory():
    public_dictionary = RES / "app/deployment/dictionary/ecdict.sqlite"
    dictionary_metadata = json.loads(public_dictionary.with_name("manifest.json").read_text(encoding="utf-8"))
    if hashlib.sha256(public_dictionary.read_bytes()).hexdigest() != dictionary_metadata["sha256"]:
        raise RuntimeError("Public dictionary checksum mismatch")
    audio_catalog = RES / "app/deployment/word-audio/catalog.sqlite"
    if audio_catalog.exists():
        audio_metadata = json.loads(audio_catalog.with_name("manifest.json").read_text(encoding="utf-8"))
        if hashlib.sha256(audio_catalog.read_bytes()).hexdigest() != audio_metadata["catalogSha256"]:
            raise RuntimeError("Word audio catalog checksum mismatch")
    lexical = RES / 'app/deployment/word-pronunciations'
    lexical_metadata = json.loads((lexical / 'manifest.json').read_text(encoding='utf-8'))
    if hashlib.sha256((lexical / 'catalog.json').read_bytes()).hexdigest() != lexical_metadata['sha256']:
        raise RuntimeError('Installed lexical pronunciation checksum mismatch')
    files = []
    forbidden = []
    for file in APP.rglob("*"):
        if not file.is_file():
            continue
        relative = file.relative_to(APP).as_posix()
        if relative == 'resources/bundle-manifest.json':
            continue  # Account for this self-describing file after serialization.
        if file.is_symlink() or file.lstat().st_file_attributes & 0x400:
            forbidden.append(relative + " (link)")
        if (file.name.startswith((".env", "feedback-", "__editable__")) or
            (file.suffix in {".sqlite", ".sqlite3", ".db", ".apkg"} and relative not in {"resources/app/deployment/dictionary/ecdict.sqlite", "resources/app/deployment/word-audio/catalog.sqlite"}) or
            file.name in {"coach-admin.token", "selected-voice.json", "pyvenv.cfg"} or
            any(name in relative.lower() for name in ("models/hub/models--qwen", "openpronounce", "whisperx/", "ja_userdic", "mecab_ko_dic", "/ipadic/", "gpt-sovits/", "gpt_sovits", "/word-tts/"))):
            forbidden.append(relative)
        files.append({"path": relative, "bytes": file.stat().st_size})
    if forbidden:
        raise RuntimeError("Unexpected files in desktop payload: " + ", ".join(forbidden[:25]))
    required = ["runtime/python/python.exe", "runtime/python/python311._pth", "runtime/node.exe", "runtime/bin/ffmpeg.exe",
                "app/web/server.js", "app/deployment/windows_service.py", "app/services/speech/ctc_word_alignment.py", "app/services/language/external_llm.py",
                "app/wordbooks/manifest.json", "app/deployment/phrases/NOTICE.md", "app/deployment/dictionary/ecdict.sqlite", "app/deployment/dictionary/LICENSE.ECDICT.txt", "voice-template.json"]
    if not PUBLIC_RELEASE:
        required.extend('app/deployment/phrases/' + name for name in ('catalog.json', 'lessons.json', 'courses.json'))
    else:
        for name in ('catalog.json', 'lessons.json', 'courses.json'):
            assert not (RES / 'app/deployment/phrases' / name).exists()
    voices = json.loads((RES / "voice-template.json").read_text(encoding="utf-8"))
    for entry in voices["voices"].values():
        required.extend(entry["voice"][key] for key in ('voice_file',))
    required.extend(['models/kokoro/kokoro-v1_0.pth', 'models/kokoro/config.json', 'app/deployment/word-pronunciations/catalog.json'])
    for name in required:
        if not (RES / name).is_file():
            raise RuntimeError("Required file missing: " + name)
    package = json.loads((RES / 'app/package.json').read_text(encoding='utf-8'))
    result = {"version": package['version'], "createdAt": datetime.now().astimezone().isoformat(), "profile": "shared-kokoro-four-voices-external-llm",
              "required": sorted(set(required)), "voiceIds": list(VOICES), "ttsProvider": 'kokoro', "localLlmIncluded": False,
              "privateDataIncluded": False, "publicResourcesOnly": PUBLIC_RELEASE,
              "coursePackIncluded": not PUBLIC_RELEASE, "files": len(files) + 1, "bytes": 0}
    payload_bytes = sum(file['bytes'] for file in files)
    manifest_path = RES / 'bundle-manifest.json'
    for _ in range(10):
        write(manifest_path, result)
        actual = payload_bytes + manifest_path.stat().st_size
        if result['bytes'] == actual:
            break
        result['bytes'] = actual
    else:
        raise RuntimeError('Bundle manifest byte count did not stabilize')
    files.append({'path': 'resources/bundle-manifest.json', 'bytes': manifest_path.stat().st_size})
    write(BUILD / "file-inventory.json", files)
    print(json.dumps({"app": str(APP), "files": result["files"], "GiB": round(result["bytes"] / 1024**3, 3), "localLlm": False, "voices": len(VOICES)}), flush=True)


def seed_inference(source: Path):
    """Reuse only immutable runtime/models; never reuse an old app or profile."""
    source = source.resolve(strict=True)
    if source == APP.resolve() or APP.exists():
        raise RuntimeError('Seed assembly requires a new, independent output directory')
    previous = json.loads((source / 'resources/bundle-manifest.json').read_text(encoding='utf-8'))
    assert previous['profile'] == 'shared-kokoro-four-voices-external-llm'
    assert previous['localLlmIncluded'] is False and previous['privateDataIncluded'] is False
    assert set(previous['voiceIds']) == set(VOICES)
    print('Copying isolated Electron runtime and immutable inference assets', flush=True)
    for item in source.iterdir():
        if item.name != 'resources' and item.is_file() and item.suffix != '.txt':
            copy(item, APP / item.name)
        elif item.name in {'locales', 'LICENSE', 'LICENSES.chromium.html', 'version'}:
            copy(item, APP / item.name)
    for name in ('runtime', 'models', 'voice-template.json'):
        copy(source / 'resources' / name, RES / name)
    # Preserve Electron's notice (it has a .txt suffix in some distributions).
    for name in ('LICENSE', 'LICENSE.txt', 'LICENSES.chromium.html'):
        if (source / name).is_file():
            copy(source / name, APP / name)


def main():
    global PUBLIC_RELEASE, ASSET_ROOT
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="Update UI/services only; keep runtime/models")
    parser.add_argument('--refresh-inference', action='store_true', help='Replace the generated inference runtime and selected model assets as well as UI/services')
    parser.add_argument("--refresh-word-audio", action="store_true", help="Update only the public word recording pack and inventory")
    parser.add_argument('--public', action='store_true', help='Ship only the five public books, no imported course/recording packs')
    parser.add_argument('--asset-root', type=Path, default=ROOT, help='Prepared immutable dictionary resources; never learner data')
    parser.add_argument('--seed-app', type=Path, help='Copy only Electron/runtime/models from a verified assembled app into a new output')
    args = parser.parse_args()
    PUBLIC_RELEASE = args.public
    ASSET_ROOT = args.asset_root.resolve(strict=True)
    if args.seed_app and (args.refresh or args.refresh_inference or args.refresh_word_audio):
        parser.error('--seed-app requires a new assembly, not a refresh')
    if args.refresh_word_audio:
        if args.refresh: parser.error("Choose one refresh mode")
        if not (RES / "bundle-manifest.json").exists(): raise RuntimeError("Desktop app is not assembled")
        running = subprocess.run(["tasklist", "/FI", "IMAGENAME eq EnglishLearning.exe", "/FO", "CSV", "/NH"], capture_output=True, text=True, errors="replace")
        if args.refresh_word_audio and '"englishlearning.exe"' in running.stdout.lower():
            raise RuntimeError("Close the desktop app before refreshing the public audio pack")
        word_audio_assets()
        inventory()
        return
    if args.refresh or args.refresh_inference:
        if not (RES / "bundle-manifest.json").exists():
            raise RuntimeError("Build the complete desktop app once before --refresh")
        previous = json.loads((RES / 'bundle-manifest.json').read_text(encoding='utf-8'))
        if previous.get('publicResourcesOnly') and not PUBLIC_RELEASE:
            parser.error('A public assembly must retain --public when refreshing')
        if not args.refresh_inference and previous.get('ttsProvider', 'unknown') != TTS_RUNTIME['provider']:
            raise RuntimeError('TTS engine changed; use --refresh-inference to update the runtime and model assets together')
    elif args.seed_app:
        seed_inference(args.seed_app)
    else:
        if (RES / "bundle-manifest.json").exists():
            raise RuntimeError("Desktop already assembled. Use --refresh for UI changes")
        APP.mkdir(parents=True, exist_ok=True)
        electron = ROOT / "apps/desktop/node_modules/electron/dist"
        if not (electron / "electron.exe").exists():
            electron = ROOT / "deployment/windows/build/electron-dist"
        expected = json.loads((ROOT / "apps/desktop/node_modules/electron/package.json").read_text())["version"]
        if (electron / "version").read_text().strip() != expected:
            raise RuntimeError("Electron runtime version mismatch")
        for item in electron.iterdir():
            if item.name != "resources":
                copy(item, APP / ("EnglishLearning.exe" if item.name == "electron.exe" else item.name))
        runtime()
        models()
    if args.refresh_inference:
        running = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq EnglishLearning.exe', '/FO', 'CSV', '/NH'], capture_output=True, text=True, errors='replace')
        if '"englishlearning.exe"' in running.stdout.lower():
            raise RuntimeError('Close the desktop app before replacing its inference runtime')
        runtime()
        models()
    ui_and_services()
    inventory()


if __name__ == "__main__":
    main()
