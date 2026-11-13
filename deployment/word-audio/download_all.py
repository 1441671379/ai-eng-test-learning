"""Resumable, conservatively paced public audio job; safe to run independently."""
from __future__ import annotations
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import traceback
import prepare_audio as builder


def stamp():
    return datetime.now(timezone.utc).isoformat()


def main():
    builder.CACHE.mkdir(parents=True, exist_ok=True)
    # A Windows byte-range lock is released by the OS when the process exits.
    lock = (builder.CACHE / "download-all.lock").open("a+b")
    if os.name == "nt":
        import msvcrt
        if not lock.tell(): lock.write(b"1"); lock.flush()
        lock.seek(0)
        try: msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            print("An audio download job is already running.", flush=True)
            return 2
    result_file = builder.CACHE / "download-result.json"
    result = {"phase": "downloading", "startedAt": stamp(), "pid": os.getpid(), "desktopUpdated": False}
    builder.json_write(result_file, result)
    try:
        # At most two requests in flight, with >=1.2s between starts globally.
        manifest = builder.pack(download_max=10000, workers=2, interval=1.2)
        complete = manifest["cachedRecordings"] == manifest["recordings"]
        result.update(phase="downloaded" if complete else "partial", updatedAt=stamp(), complete=complete,
                      recordings=manifest["recordings"], cachedRecordings=manifest["cachedRecordings"],
                      wordsWithLocalAudio=manifest["wordsWithLocalAudio"], bytes=manifest["bytes"])
        builder.json_write(result_file, result)
        desktop = builder.ROOT / "deployment/electron/build/EnglishLearning/resources/bundle-manifest.json"
        if desktop.exists():
            refresh = subprocess.run([sys.executable, "-X", "utf8", str(builder.ROOT / "deployment/electron/build_desktop.py"), "--refresh-word-audio"], cwd=builder.ROOT)
            result["desktopUpdated"] = refresh.returncode == 0
            if refresh.returncode:
                result["desktopNote"] = "Audio is saved. Close the desktop app, then rerun the job to refresh its resource pack."
        result["phase"] = "complete" if complete else "partial"
        result["updatedAt"] = stamp()
        builder.json_write(result_file, result)
        progress = json.loads((builder.CACHE / "download-progress.json").read_text(encoding="utf-8"))
        progress.update(phase=result["phase"], desktopUpdated=result["desktopUpdated"], updatedAt=stamp())
        builder.json_write(builder.CACHE / "download-progress.json", progress)
        print(json.dumps(result), flush=True)
        return 0 if complete else 3
    except Exception as error:
        result.update(phase="failed", updatedAt=stamp(), error=str(error))
        builder.json_write(result_file, result)
        traceback.print_exc()
        return 1
    finally:
        lock.close()


if __name__ == "__main__":
    raise SystemExit(main())
