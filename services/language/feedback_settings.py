"""Per-profile coaching configuration; API keys protected with Windows DPAPI."""
from __future__ import annotations
import base64
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import secrets
from threading import Lock
from urllib.parse import urlsplit
from uuid import uuid4


def protect_key(value: str, *, decrypt: bool = False) -> str:
    if not value:
        return ""
    if os.name != "nt":
        raise ValueError("API key storage requires Windows DPAPI on this installation.")
    class Blob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]
    data = base64.b64decode(value) if decrypt else value.encode("utf-8")
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    output = Blob()
    function = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    function.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p,
                         ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    function.restype = wintypes.BOOL
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output)):
        raise ValueError("Cannot access the saved API key with this Windows account.")
    try:
        result = ctypes.string_at(output.data, output.size)
        return result.decode("utf-8") if decrypt else base64.b64encode(result).decode("ascii")
    finally:
        ctypes.windll.kernel32.LocalFree.argtypes = [ctypes.c_void_p]
        ctypes.windll.kernel32.LocalFree(output.data)


class FeedbackSettings:
    def __init__(self, root: Path, local_model: str, *, local_enabled: bool = True):
        self.root, self.local_model = root, local_model
        self.local_enabled = local_enabled
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = Lock()
        token_file = root / "coach-admin.token"
        try:
            with token_file.open("x", encoding="utf-8") as file:
                file.write(secrets.token_urlsafe(32))
        except FileExistsError:
            pass
        self.token = token_file.read_text(encoding="utf-8").strip()
        if not self.token:
            raise RuntimeError("Coach administration token is empty.")

    def path(self, user_id: str) -> Path:
        if not isinstance(user_id, str) or not user_id or len(user_id) > 256:
            raise ValueError("Invalid local profile.")
        return self.root / ("feedback-" + hashlib.sha256(user_id.encode()).hexdigest() + ".json")

    def read(self, user_id: str) -> dict:
        path = self.path(user_id)
        defaults = {"enabled": True, "provider": "chat-completions", "model": "deepseek-flash",
                    "baseUrl": "https://api.deepseek.com/v1", "language": "zh",
                    "encryptedKey": ""}
        if path.is_file():
            defaults.update(json.loads(path.read_text(encoding="utf-8")))
        return defaults

    def public(self, settings: dict) -> dict:
        result = {key: settings[key] for key in ("enabled", "provider", "model", "baseUrl", "language")} | {
            "hasApiKey": bool(settings.get("encryptedKey")), "localModel": self.local_model,
            "scope": "global", "configured": (self.local_enabled if settings["provider"] == "local" else bool(settings.get("encryptedKey")))}
        if not self.local_enabled:
            result["localAvailable"] = False
        return result

    def save(self, user_id: str, value: dict) -> dict:
        with self.lock:
            previous = self.read(user_id)
            if value.get("provider") == "local" and not self.local_enabled:
                raise ValueError("Local LLM is disabled. Choose an external API provider.")
            if type(value.get("enabled")) is not bool or value.get("provider") not in {"local", "chat-completions"} or value.get("language") not in {"zh", "en"}:
                raise ValueError("Choose a supported model provider and explanation language.")
            model = value.get("model", "")
            url = value.get("baseUrl", "")
            key = value.get("apiKey", "")
            if not all(isinstance(item, str) for item in (model, url, key)) or len(model) > 200 or len(url) > 2000 or len(key) > 4096:
                raise ValueError("Invalid API configuration.")
            model, url, key = model.strip(), url.strip().rstrip("/"), key.strip()
            parts = urlsplit(url)
            try:
                parts.port
            except ValueError:
                raise ValueError("Invalid API port.") from None
            valid = parts.scheme == "https" or (parts.scheme == "http" and parts.hostname in {"localhost", "127.0.0.1", "::1"})
            if not valid or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment or any(char.isspace() for char in url):
                raise ValueError("Base URL must be HTTPS, or HTTP on localhost, without credentials or query parameters.")
            if url.endswith("/chat/completions"):
                url = url[:-len("/chat/completions")]
            encrypted = previous["encryptedKey"]
            if value.get("clearApiKey") is True:
                encrypted = ""
            if url != previous["baseUrl"] and not key:
                encrypted = ""  # Never send a saved key to a different destination.
            if key:
                encrypted = protect_key(key)
            if value["provider"] == "chat-completions" and not model:
                raise ValueError("External API requires a model name.")
            settings = {"enabled": value["enabled"], "provider": value["provider"],
                        "language": value["language"], "model": model or "deepseek-flash",
                        "baseUrl": url, "encryptedKey": encrypted}
            path = self.path(user_id)
            temporary = path.with_suffix(f".{uuid4().hex}.tmp")
            try:
                temporary.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
            return self.public(settings)
