"""Installed services: portable paths, per-user writes and a Windows job for cleanup."""
from __future__ import annotations
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import subprocess
import sys
import threading


def service_environment(service, source=None):
    """Keep the desktop allowlist, adding only the OS helper needed by DPAPI."""
    env = dict(os.environ if source is None else source)
    if service == 'web':
        # The restricted desktop PATH omits this System32 subdirectory. Node's
        # encrypted Tencent settings use Windows PowerShell, not a bundled tool.
        system = env.get('SystemRoot') or env.get('SYSTEMROOT') or env.get('WINDIR') or 'C:/Windows'
        helper = str(Path(system) / 'System32/WindowsPowerShell/v1.0')
        previous = next((value for key, value in env.items() if key.upper() == 'PATH'), '')
        for key in list(env):
            if key.upper() == 'PATH':
                del env[key]
        env['PATH'] = helper + (os.pathsep + previous if previous else '')
    return env


def native_kernel_cache(user_data):
    """PyTorch's Windows CUDA kernel cache must not contain non-ASCII paths."""
    import hashlib
    import tempfile
    user_data = Path(user_data)
    identity = hashlib.sha256(str(user_data).encode('utf-8')).hexdigest()[:20]
    name = 'EnglishLearning-kernels-' + identity
    candidates = [user_data / 'kernel-cache', Path(os.environ['SystemRoot']) / 'Temp' / name,
                  Path(os.environ.get('PUBLIC', 'C:/Users/Public')) / 'Documents' / name]
    for cache in candidates:
        if not str(cache).isascii():
            continue
        try:
            cache.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryFile(dir=cache):
                pass
            return str(cache)
        except OSError:
            continue
    raise RuntimeError('Cannot prepare a writable ASCII path for the CUDA kernel cache.')


def ascii_espeak_data(source, user_data):
    """espeak-ng's Windows CRT cannot open UTF-8 filenames; keep its data ASCII."""
    import hashlib
    import shutil
    import tempfile
    source = Path(source)
    if str(source).isascii():
        return str(source)
    identity = hashlib.sha256((str(user_data) + "|" + str(source)).encode("utf-8")).hexdigest()[:20]
    candidates = [Path(os.environ["SystemRoot"]) / "Temp",
                  Path(os.environ.get("PUBLIC", "C:/Users/Public")) / "Documents"]
    errors = []
    for parent in candidates:
        if not str(parent).isascii():
            continue
        cache = parent / ("EnglishLearning-espeak-" + identity)
        target = cache / "espeak-ng-data"
        temporary = None
        try:
            cache.mkdir(exist_ok=True)
            if not (target / "phontab").is_file():
                temporary = Path(tempfile.mkdtemp(prefix="preparing-", dir=cache))
                shutil.copytree(source, temporary / "espeak-ng-data")
                try:
                    (temporary / "espeak-ng-data").rename(target)
                except FileExistsError:
                    pass  # Another service initialized this shared data first.
            return str(target)
        except OSError as error:
            errors.append(str(error))
        finally:
            if temporary is not None:
                shutil.rmtree(temporary, ignore_errors=True)
    raise RuntimeError("Cannot prepare an ASCII path for pronunciation data: " + "; ".join(errors))


def guard_parent():
    # Every guardian and its descendants share a job. A crashed/closed Electron
    # releases the guardian, and closing the last job handle kills its children.
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateJobObjectW.restype = wintypes.HANDLE
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]

    class Limits(ctypes.Structure):
        _fields_ = [("process_time", ctypes.c_longlong), ("job_time", ctypes.c_longlong),
                    ("flags", wintypes.DWORD), ("minimum", ctypes.c_size_t), ("maximum", ctypes.c_size_t),
                    ("active", wintypes.DWORD), ("affinity", ctypes.c_size_t),
                    ("priority", wintypes.DWORD), ("scheduling", wintypes.DWORD)]
    class IO(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in ("ro", "wo", "oo", "rb", "wb", "ob")]
    class Extended(ctypes.Structure):
        _fields_ = [("limits", Limits), ("io", IO), ("process_memory", ctypes.c_size_t),
                    ("job_memory", ctypes.c_size_t), ("peak_process", ctypes.c_size_t), ("peak_job", ctypes.c_size_t)]
    job = kernel.CreateJobObjectW(None, None)
    limits = Extended()
    limits.limits.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not job or not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)) or not kernel.AssignProcessToJobObject(job, kernel.GetCurrentProcess()):
        raise ctypes.WinError(ctypes.get_last_error())
    parent = kernel.OpenProcess(0x100000, False, int(os.environ["ENGLISH_PARENT_PID"]))
    if not parent:
        raise RuntimeError("Desktop parent has exited.")
    def watch():
        kernel.WaitForSingleObject(parent, 0xFFFFFFFF)
        os._exit(1)
    threading.Thread(target=watch, daemon=True).start()
    return job, parent  # keep handles alive until exit


def child(service, config):
    root = Path(config["root"])
    data = Path(config["data"])
    sys.dont_write_bytecode = True
    sys.path[:0] = [str(root / "app" / "deployment"), str(root / "app/services/common")]
    if service != "coach":
        os.environ['PYTORCH_KERNEL_CACHE_PATH'] = native_kernel_cache(data)
        import torch
        torch.set_num_threads(4)
    if service in ("ai", "tts"):
        import espeakng_loader
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
        speech_data = ascii_espeak_data(espeakng_loader.get_data_path(), data)
        espeakng_loader.get_data_path = lambda: speech_data
        EspeakWrapper.set_library(espeakng_loader.get_library_path())
        EspeakWrapper.set_data_path(speech_data)
        os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = espeakng_loader.get_library_path()
    folder, module = {
        "ai": (root / "app" / "services" / "speech", "main:app"),
        "tts": (root / "app/services/speech", "kokoro_api:app"),
        "coach": (root / "app" / "services" / "language", "main:app"),
    }[service]
    os.chdir(folder)
    sys.path[:0] = [str(folder), str(root / "app/services/common")]
    import uvicorn
    uvicorn.run(module, host="127.0.0.1", port=config["ports"][service], log_level="info")


if __name__ == "__main__":
    service, config_file = sys.argv[1:3]
    config = json.loads(Path(config_file).read_text(encoding="utf-8"))
    if "--child" in sys.argv:
        child(service, config)
    else:
        handles = guard_parent()
        root = Path(config["root"])
        if service == "web":
            if config.get("devRoot"):
                cwd = Path(config["devRoot"]) / "apps/web"
                command = [str(root / "runtime/node.exe"), str(cwd / "node_modules/next/dist/bin/next"),
                           "dev", "--hostname", "127.0.0.1", "--port", str(config["ports"][service])]
                os.environ["NODE_ENV"] = "development"
            else:
                command = [str(root / "runtime/node.exe"), str(root / "app/web/server.js")]
                cwd = root / "app/web"
        else:
            python = root / "runtime/python/python.exe"
            command = [str(python), "-B", str(Path(__file__).resolve()), service, config_file, "--child"]
            cwd = root
        print(f"Starting {service}", flush=True)
        process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.DEVNULL,
                                   stdout=sys.stdout, stderr=sys.stderr,
                                   env=service_environment(service),
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        sys.exit(process.wait())
