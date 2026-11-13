"""Seal the CURRENT assembled Electron directory in an Inno Setup installer.

No old staging tree, original runtimes, model downloads, user profiles or API
keys are copied. Source files are read in place through a short temporary drive.
Every release gets its own output directory and full source/artifact hashes.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
APP = HERE / "build/EnglishLearning"
APP_ID = "{16B963DB-3876-4F09-AD5D-9E5E645C0FF5}"


def write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(path: Path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        while data := stream.read(4 * 1024 * 1024):
            result.update(data)
    return result.hexdigest()


def inventory(cached: Path | None = None):
    manifest = json.loads((APP / "resources/bundle-manifest.json").read_text(encoding="utf-8"))
    package = json.loads((APP / "resources/app/package.json").read_text(encoding="utf-8"))
    assert manifest["profile"] == "shared-kokoro-four-voices-external-llm"
    assert manifest["localLlmIncluded"] is False and manifest["privateDataIncluded"] is False
    assert set(manifest["voiceIds"]) == {"af_heart", "am_puck", "bf_emma", "bm_george"}
    assert package["version"] == manifest["version"]
    assert (APP / "EnglishLearning.exe").is_file()
    assert all((APP / "resources" / name).is_file() for name in manifest["required"])
    entries = []
    previous = {}
    cached_time = 0
    if cached:
        saved = json.loads(cached.read_text(encoding="utf-8"))
        assert Path(saved["source"]).resolve() == APP.resolve() and saved["version"] == package["version"]
        previous = {entry["path"]: entry for entry in saved["files"]}
        cached_time = cached.stat().st_mtime_ns
    for directory, folders, names in os.walk(APP, followlinks=False):
        for name in folders + names:
            file = Path(directory) / name
            if file.lstat().st_file_attributes & 0x400:
                raise RuntimeError(f"Reparse point in payload: {file}")
        for name in sorted(names):
            path = Path(directory) / name
            relative = path.relative_to(APP).as_posix()
            parts = {part.lower() for part in path.relative_to(APP).parts}
            if (name.startswith((".env", "feedback-")) or name in {
                "local-profile.json", "coach-admin.token", "selected-voice.json", "tts-settings.json"
            } or {"__pycache__", ".git", "learning-data"} & parts or
                    any(part.startswith("models--qwen") for part in parts)):
                raise RuntimeError(f"Unexpected private/development asset: {relative}")
            info = path.stat()
            if cached:
                old = previous.get(relative)
                if not old or old["bytes"] != info.st_size or max(info.st_mtime_ns, info.st_ctime_ns) > cached_time:
                    raise RuntimeError(f"Payload changed after the cached full hash; rebuild without --inventory: {relative}")
                sha = old["sha256"]
            else:
                sha = digest(path)
            entries.append({"path": relative, "bytes": info.st_size, "sha256": sha})
            if len(entries) % 5000 == 0:
                print(f"{'Verified cached hash metadata for' if cached else 'Hashed'} {len(entries)} source files", flush=True)
    entries.sort(key=lambda entry: entry["path"])
    if cached:
        assert {entry["path"] for entry in entries} == set(previous)
    assert len(entries) == manifest["files"], (len(entries), manifest["files"])
    assert sum(entry["bytes"] for entry in entries) == manifest["bytes"]
    return manifest, package, entries


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--compiler", type=Path, default=Path(os.environ["LOCALAPPDATA"]) / "Programs/Inno Setup 6/ISCC.exe")
    parser.add_argument("--inventory", type=Path, help="Reuse a completed full hash only while every source file is unchanged since that report")
    args = parser.parse_args()
    if os.name != "nt" or not args.compiler.is_file():
        raise RuntimeError("An installed Windows Inno Setup compiler is required.")
    stamp = datetime.now(timezone(timedelta(hours=8))).strftime("%Y%m%d-%H%M%S")
    report = HERE / "installer-reports" / stamp
    report.mkdir(parents=True, exist_ok=False)
    print("Verifying and hashing the current four-voice Electron application", flush=True)
    manifest, package, entries = inventory(args.inventory)
    version = package["version"]
    output = HERE / "dist" / f"EnglishLearning-{version}-Windows-x64-{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    write(report / "payload.json", {"source": str(APP), "version": version, "files": entries})
    drive = next((letter + ":" for letter in "RSTUVWXYZ" if not Path(letter + ":/").exists()), None)
    if drive is None:
        raise RuntimeError("No free temporary drive letter for the compiler source alias.")
    subprocess.run(["subst.exe", drive, str(APP)], check=True)
    started = time.monotonic()
    try:
        command = [str(args.compiler), "/Qp", f"/DSourceRoot={drive}", f"/DOutputRoot={output}", f"/DProductVersion={version}", str(HERE / "installer.iss")]
        print(f"Compressing {manifest['bytes'] / 1e9:.3f} GB into {output}", flush=True)
        with (report / "compile.log").open("wb") as log:
            subprocess.run(command, cwd=HERE, stdout=log, stderr=subprocess.STDOUT, check=True)
    finally:
        subprocess.run(["subst.exe", drive, "/D"], check=True)
    artifacts = []
    for path in sorted(output.iterdir()):
        if path.suffix in {".exe", ".bin"}:
            artifacts.append({"file": path.name, "bytes": path.stat().st_size, "sha256": digest(path)})
    if not any(item["file"].endswith("-Setup.exe") for item in artifacts) or not any(item["file"].endswith(".bin") for item in artifacts):
        raise RuntimeError("Installer compiler did not produce its launcher and offline data files.")
    total = sum(item["bytes"] for item in artifacts)
    release = {"version": version, "appId": APP_ID, "builtAt": datetime.now(timezone.utc).isoformat(),
               "output": str(output), "report": str(report), "source": str(APP), "sourceBytes": manifest["bytes"],
               "sourceFiles": len(entries), "installerBytes": total, "signed": False,
               "profile": manifest["profile"], "voiceIds": manifest["voiceIds"], "artifacts": artifacts,
               "compileSeconds": round(time.monotonic() - started, 2)}
    write(output / "RELEASE.json", {key: value for key, value in release.items() if key not in {"source", "report", "output"}})
    shutil.copy2(HERE / "installer/ChineseSimplified-LICENSE.txt", output / "Inno-Chinese-MIT.txt")
    (output / "SHA256SUMS.txt").write_text("".join(f"{item['sha256']}  {item['file']}\n" for item in artifacts), encoding="utf-8")
    (output / "安装说明.txt").write_text(
        f"English Learning {version} Windows x64\n\n"
        "请将此文件夹内的全部文件一起分享、保存在同一个文件夹。\n"
        f"双击 EnglishLearning-{version}-Windows-x64-Setup.exe，然后按提示选择安装位置。\n"
        "配套 .bin 文件是安装数据，不能省略、改名或拆开存放。安装完成后可删除这一整个安装文件夹。\n\n"
        f"安装文件合计：{total / 1e9:.2f} GB（{total / 1024**3:.2f} GiB）。\n"
        f"应用解压体积：{manifest['bytes'] / 1e9:.2f} GB。录音与生成音频会额外占用空间。\n"
        "默认安装到当前用户的 Programs 文件夹，可以选择其他磁盘。\n"
        "软件内附 Python、Node、本地语音模型及四种音色，无需另装开发环境。\n"
        "首次使用时，在设置中填写自己的外部语言模型 API。此包不含任何个人 API Key 或学习记录。\n"
        "卸载后，学习记录和设置保留在 %APPDATA%\\EnglishLearningDesktop。\n\n"
        "此测试版尚未数字签名，Windows 可能显示未知发布者。建议先在目标电脑试用。\n"
        "SHA256SUMS.txt 可用于校验传输后的安装文件是否完整。\n",
        encoding="utf-8-sig")
    write(report / "release.json", release)
    write(HERE / "dist/latest.json", release)
    from installer_bootstrap import finish_distribution
    release = finish_distribution(release)
    total = release["installerBytes"]
    print(json.dumps({"output": str(output), "installerGB": round(total / 1e9, 3), "installerGiB": round(total / 1024**3, 3), "files": len(release["artifacts"]), "report": str(report)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
