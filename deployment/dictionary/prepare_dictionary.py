"""Build the shared, read-only ECDICT index with Python's standard library.

Only ecdict.csv and its repository LICENSE are used. lemma.en.txt is deliberately
excluded. Run from any directory; source downloads are pinned to one commit.
"""
from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import urllib.request

HERE = Path(__file__).resolve().parent
COMMIT = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"
CSV_SHA256 = "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
BASE = f"https://raw.githubusercontent.com/skywind3000/ECDICT/{COMMIT}"


def key(value):
    return re.sub(r"\s+", " ", value.replace("’", "'").replace("‘", "'").replace("‐", "-").replace("‑", "-")).strip().lower()


def build(source: Path, target: Path):
    csv.field_size_limit(8 * 1024 * 1024)
    db = sqlite3.connect(target)
    try:
        db.executescript("""
          PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
          CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
          CREATE TABLE entries (word_key TEXT PRIMARY KEY, word TEXT NOT NULL,
            phonetic TEXT NOT NULL, definition TEXT NOT NULL, translation TEXT NOT NULL,
            pos TEXT NOT NULL, tags TEXT NOT NULL, exchange TEXT NOT NULL) WITHOUT ROWID;
          CREATE TABLE forms (form_key TEXT NOT NULL, headword_key TEXT NOT NULL, kind TEXT NOT NULL,
            PRIMARY KEY(form_key,headword_key,kind)) WITHOUT ROWID;
        """)
        total = 0
        with source.open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                word = row["word"].strip()
                word_key = key(word)
                if not word_key:
                    continue
                # Keep full bilingual definitions; the personal-card layer applies its own limits.
                values = [word_key, word] + [row.get(field, "") or "" for field in ("phonetic", "definition", "translation", "pos", "tag", "exchange")]
                db.execute("INSERT OR IGNORE INTO entries VALUES (?,?,?,?,?,?,?,?)", values)
                for exchange in (row.get("exchange") or "").split("/"):
                    kind, separator, variants = exchange.partition(":")
                    if not separator or kind not in {"p", "d", "i", "3", "r", "t", "s", "0"}:
                        continue
                    for variant in variants.split(","):
                        form, headword = (word_key, key(variant)) if kind == "0" else (key(variant), word_key)
                        if form and headword and form != headword:
                            db.execute("INSERT OR IGNORE INTO forms VALUES (?,?,?)", (form, headword, kind))
                total += 1
                if total % 100_000 == 0:
                    print(f"Indexed {total:,} source rows", flush=True)
        db.execute("DELETE FROM forms WHERE headword_key NOT IN (SELECT word_key FROM entries)")
        metadata = {
            "schema": "1", "source": "ECDICT", "commit": COMMIT,
            "url": "https://github.com/skywind3000/ECDICT",
            "csvSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "entries": str(db.execute("SELECT count(*) FROM entries").fetchone()[0]),
            "forms": str(db.execute("SELECT count(*) FROM forms").fetchone()[0]),
        }
        db.executemany("INSERT INTO metadata VALUES (?,?)", metadata.items())
        db.commit()
        db.execute("VACUUM")
        if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise RuntimeError("Dictionary index integrity check failed")
        return metadata
    finally:
        db.close()


def main():
    sources = HERE / "sources"
    sources.mkdir(exist_ok=True)
    for name in ("ecdict.csv", "LICENSE"):
        path = sources / name
        if not path.exists():
            print(f"Downloading pinned {name}", flush=True)
            with urllib.request.urlopen(f"{BASE}/{name}", timeout=120) as response:
                temporary = path.with_suffix(path.suffix + ".download")
                with temporary.open("wb") as output:
                    while block := response.read(1024 * 1024):
                        output.write(block)
                temporary.replace(path)
    target = HERE / "ecdict.sqlite"
    if hashlib.sha256((sources / "ecdict.csv").read_bytes()).hexdigest() != CSV_SHA256:
        raise RuntimeError("Pinned ECDICT source checksum mismatch; refusing to replace the index")
    temporary = HERE / "ecdict.building.sqlite"
    temporary.unlink(missing_ok=True)
    metadata = build(sources / "ecdict.csv", temporary)
    temporary.replace(target)
    (HERE / "LICENSE.ECDICT.txt").write_bytes((sources / "LICENSE").read_bytes())
    (HERE / "manifest.json").write_text(json.dumps({**metadata, "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**metadata, "MiB": round(target.stat().st_size / 1024**2, 2)}), flush=True)


if __name__ == "__main__":
    main()
