"""Local service entry point. No imports from either legacy application."""
import os
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "services/common"))
from legacy_environment import apply_legacy_environment


def main():
    apply_legacy_environment()
    service = sys.argv[1]
    port_file = ROOT / "deployment/service-ports.json"
    saved_ports = json.loads(port_file.read_text(encoding="utf-8-sig")) if port_file.exists() else {}
    model_port = int(os.environ.get("COACH_ENGINE_PORT") or saved_ports.get("model", 8001))
    if not 1024 <= model_port <= 65535:
        raise ValueError("Invalid model service port")
    ports = {"speech": int(os.getenv('AI_ENGINE_PORT', '8000')), "language": model_port,
             "tts": int(os.getenv('ENGLISH_TTS_PORT', '9881'))}
    if service not in ports:
        raise SystemExit("Choose speech or language")
    defaults = {
        "HF_HOME": str(ROOT / "models"), "HF_HUB_OFFLINE": "1",
        "HF_HUB_DISABLE_SYMLINKS_WARNING": "1", "HF_HUB_DISABLE_TELEMETRY": "1",
        "PYTHONUTF8": "1",
        "COACH_LLM_DEVICE": "cuda", "ENGLISH_CPU_THREADS": "4",
        # Shared application data and voice configuration.
        "ENGLISH_DATA_DIR": str(ROOT / "deployment/learning-data"),
        "ENGLISH_TTS_CONFIG": str(ROOT / "deployment/kokoro/settings.json"),
        "ENGLISH_TTS_PROVIDER": "kokoro",
    }
    for key, value in defaults.items():
        os.environ.setdefault(key, value)
    runtime_file = ROOT / 'deployment/tts/runtime.json'
    if runtime_file.exists():
        runtime = json.loads(runtime_file.read_text(encoding='utf-8-sig'))
        os.environ.setdefault('ENGLISH_TTS_PROVIDER', runtime['provider'])
        os.environ.setdefault('ENGLISH_TTS_CONFIG', str(ROOT / runtime['config']))
    import espeakng_loader
    from phonemizer.backend.espeak.wrapper import EspeakWrapper
    EspeakWrapper.set_library(espeakng_loader.get_library_path())
    EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
    os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = espeakng_loader.get_library_path()
    import imageio_ffmpeg
    bin_dir = ROOT / "deployment/bin"
    bin_dir.mkdir(exist_ok=True)
    ffmpeg = bin_dir / "ffmpeg.exe"
    if not ffmpeg.exists():
        shutil.copyfile(imageio_ffmpeg.get_ffmpeg_exe(), ffmpeg)
    os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")
    folder = ROOT / "services" / ('speech' if service == 'tts' else service)
    os.chdir(folder)
    sys.path[:0] = [str(folder), str(ROOT / "services/common")]
    import uvicorn
    if service == 'tts':
        import torch
        torch.set_num_threads(int(os.getenv('ENGLISH_CPU_THREADS', '4')))
    uvicorn.run("kokoro_api:app" if service == 'tts' else "main:app", host="127.0.0.1", port=ports[service], log_level="info")


if __name__ == "__main__":
    main()
