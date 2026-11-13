"""One-way support for older launchers; all application settings use ENGLISH_."""
import os
from pathlib import Path


def apply_legacy_environment():
    for key, value in tuple(os.environ.items()):
        if key.startswith("CADENCE_"):
            os.environ.setdefault("ENGLISH_" + key[len("CADENCE_"):], value)
    root = Path(__file__).resolve().parents[2]
    for name, old, new in (
        ("ENGLISH_DATA_DIR", "deployment/cadence-data", "deployment/learning-data"),
    ):
        configured = os.environ.get(name)
        if configured and Path(configured).resolve() == (root / old).resolve() and (root / new).exists():
            os.environ[name] = str(root / new)
