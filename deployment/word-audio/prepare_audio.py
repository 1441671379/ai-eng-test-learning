"""Build a small licensed pronunciation pack, independent of learner data.

Uses the English Wiktionary index from Kaikki and original Commons audio.
Only target words in installed CET4/CET6 and the application's sample book are
considered. Downloads are resumable by file; no upstream executable is run.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import sqlite3
import threading
import time
from email.utils import parsedate_to_datetime
import urllib.parse
import urllib.request
import urllib.error

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CACHE = HERE / "sources"
DATA_URL = "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz"
UA = "EnglishLearningAudioBuilder/0.1 (local educational pronunciation pack; source metadata retained)"
HETERONYMS = {"record", "read", "lead", "bow", "wind", "tear", "close", "live", "minute", "present", "object", "produce", "refuse", "invalid", "desert", "content", "conduct", "permit", "project", "subject", "progress", "contract", "export", "import"}


class DownloadGate:
    """All media workers share pacing and the server's full cooldown period."""
    def __init__(self, interval=0.25):
        self.lock = threading.Lock()
        self.interval = max(0.1, interval)
        self.next_start = 0
        try:
            self.cooldown = float(json.loads((CACHE / "download-cooldown.json").read_text(encoding="utf-8"))["until"])
        except (OSError, ValueError, KeyError):
            self.cooldown = 0

    def acquire(self):
        while True:
            with self.lock:
                wait = max(self.cooldown, self.next_start) - time.time()
                if wait <= 0:
                    self.next_start = time.time() + self.interval
                    return
            time.sleep(min(wait, 30))

    def defer(self, retry_after):
        try:
            seconds = float(retry_after)
        except (ValueError, TypeError):
            try:
                seconds = parsedate_to_datetime(retry_after).timestamp() - time.time()
            except (ValueError, TypeError, OverflowError):
                seconds = 60
        seconds = max(5, seconds)
        with self.lock:
            self.cooldown = max(self.cooldown, time.time() + seconds)
            json_write(CACHE / "download-cooldown.json", {"until": self.cooldown, "retryAfterSeconds": seconds})
        print(f"Media server requested a shared cooldown of {seconds:.0f}s; all workers will wait", flush=True)


DOWNLOAD_GATE = None


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []
    def handle_data(self, data):
        self.parts.append(data)


def plain(value):
    parser = PlainText(); parser.feed(value or "")
    return " ".join(" ".join(parser.parts).split())[:3000]


def fetch(url, timeout=60):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout)


def key(word):
    return " ".join(word.replace("’", "'").replace("‘", "'").replace("‐", "-").replace("‑", "-").lower().split())


def json_write(file, value):
    temporary = file.with_suffix(file.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(file)


def targets():
    words = {}
    for book in ("cet4", "cet6"):
        for item in json.loads((ROOT / f"deployment/vocabulary/books/{book}.json").read_text(encoding="utf-8")):
            words.setdefault(key(item["word"]), []).append(book)
    sample = (ROOT / "apps/web/src/lib/vocabulary-sample.ts").read_text(encoding="utf-8")
    for word in re.findall(r'word:\s*"([^"]+)"', sample):
        words.setdefault(key(word), []).append("sample")
    return words


def index():
    CACHE.mkdir(parents=True, exist_ok=True)
    source = CACHE / "english.jsonl.gz"
    if not source.exists():
        temporary = source.with_suffix(".download")
        with fetch(DATA_URL, 120) as response, temporary.open("wb") as output:
            total, done = int(response.headers.get("Content-Length", 0)), 0
            modified = response.headers.get("Last-Modified", "")
            while block := response.read(1024 * 1024):
                output.write(block); done += len(block)
                if done % (32 * 1024 * 1024) == 0:
                    print(f"Dictionary index download: {done // 1024**2} / {total // 1024**2} MiB", flush=True)
        if total and done != total:
            raise RuntimeError("Incomplete dictionary download")
        temporary.replace(source)
        json_write(CACHE / "source.json", {"url": DATA_URL, "lastModified": modified, "downloadedAt": datetime.now(timezone.utc).isoformat(), "sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
    wanted = targets(); matched = defaultdict(dict)
    with gzip.open(source, "rt", encoding="utf-8") as stream:
        for line in stream:
            item = json.loads(line)
            word = key(item.get("word", ""))
            if item.get("lang_code") != "en" or word not in wanted:
                continue
            for sound in item.get("sounds", []):
                name, url = sound.get("audio", ""), sound.get("ogg_url", "")
                if not name or not url or urllib.parse.urlparse(url).hostname != "upload.wikimedia.org":
                    continue
                if re.search(r"(?:tts|synthetic|espeak)", name + " " + sound.get("text", ""), re.I):
                    continue
                tags = sound.get("tags", [])
                accent = "us" if any(t in tags for t in ("US", "General-American")) or re.match(r"en-us-", name, re.I) else "uk" if any(t in tags for t in ("UK", "Received-Pronunciation")) or re.match(r"en-(?:uk|gb)-", name, re.I) else "other"
                value = matched[word].setdefault(name, {"word": word, "file": name, "url": url, "accent": accent, "tags": tags, "label": sound.get("text", ""), "ipa": sound.get("audio-ipa", ""), "pos": []})
                if item.get("pos") and item["pos"] not in value["pos"]:
                    value["pos"].append(item["pos"])
    selected = []
    for word, values in matched.items():
        groups = defaultdict(list)
        for value in values.values(): groups[value["accent"]].append(value)
        for accent, group in groups.items():
            # Canonically named recordings first. Alternative heteronym readings
            # are preserved for explicit selection rather than guessed from spelling.
            group.sort(key=lambda value: (not value["file"].lower().startswith(("en-us-", "en-uk-", "en-gb-")), value["file"]))
            selected.extend(group[:4 if word in HETERONYMS else 1])
    json_write(CACHE / "candidates.json", selected)
    json_write(CACHE / "targets.json", wanted)
    print(json.dumps({"targetWords": len(wanted), "wordsWithAudioCandidates": len(matched), "selectedRecordings": len(selected)}), flush=True)


def metadata(names, on_batch=None):
    result = {}
    for start in range(0, len(names), 40):
        group = names[start:start + 40]
        cache = CACHE / ("metadata-" + hashlib.sha256("|".join(group).encode()).hexdigest()[:20] + ".json")
        if cache.exists():
            data = json.loads(cache.read_text(encoding="utf-8"))
        else:
            query = urllib.parse.urlencode({"action": "query", "format": "json", "redirects": "1", "prop": "imageinfo", "iiprop": "url|size|extmetadata", "titles": "|".join("File:" + n for n in group), "maxlag": "5"})
            for attempt in range(4):
                try:
                    with fetch("https://commons.wikimedia.org/w/api.php?" + query) as response:
                        data = json.load(response)
                    if "error" in data: raise RuntimeError(str(data["error"]))
                    json_write(cache, data); break
                except Exception as error:
                    if attempt == 3: raise
                    delay = max(int(error.headers.get("Retry-After", "60")), 60 * (attempt + 1)) if isinstance(error, urllib.error.HTTPError) and error.code == 429 else 3 * (attempt + 1)
                    print(f"Metadata request deferred ({type(error).__name__}); waiting {delay}s before retry", flush=True)
                    time.sleep(delay)
            time.sleep(5)
        pages = {p["title"]: p for p in data.get("query", {}).get("pages", {}).values()}
        aliases = {p["from"]: p["to"] for p in data.get("query", {}).get("normalized", []) + data.get("query", {}).get("redirects", [])}
        batch = {}
        for name in group:
            title = "File:" + name
            for _ in range(4):
                if title in aliases: title = aliases[title]
            page = pages.get(title, {})
            if not page.get("imageinfo"): continue
            info = page["imageinfo"][0]; ext = info.get("extmetadata", {})
            value = lambda field: plain(ext.get(field, {}).get("value", ""))
            license_name, license_url = value("LicenseShortName"), value("LicenseUrl")
            # Only explicit public-domain/CC0/CC-BY/CC-BY-SA grants are included.
            if not (license_name in {"Public domain", "CC0"} or re.fullmatch(r"CC BY(?:-SA)? [1-4]\.0(?: [A-Za-z-]+)?", license_name)):
                continue
            if not license_url and license_name == "Public domain": license_url = "https://creativecommons.org/publicdomain/mark/1.0/"
            if not license_url.startswith(("https://creativecommons.org/", "http://creativecommons.org/")): continue
            if info.get("size", 0) > 2 * 1024 * 1024: continue
            info_url = info.get("url", "")
            if urllib.parse.urlparse(info_url).hostname != "upload.wikimedia.org": continue
            author = value("Artist")
            if license_name.startswith("CC BY") and not author: continue
            result[name] = {"originalUrl": info_url, "sourceUrl": info.get("descriptionurl", ""), "author": author, "license": license_name, "licenseUrl": license_url.replace("http:", "https:"), "credit": value("Credit"), "attribution": value("Attribution"), "copyrighted": value("Copyrighted")}
            batch[name] = result[name]
        if on_batch is not None: on_batch(batch)
        if start % 400 == 0: print(f"License metadata: {min(start+len(group),len(names))}/{len(names)} files", flush=True)
    return result


def download(item):
    identity = hashlib.sha256(item["file"].encode()).hexdigest()
    (CACHE / "audio").mkdir(exist_ok=True)
    destination = CACHE / "audio" / (identity + ".ogg")
    try:
        if not destination.exists():
            for attempt in range(6):
                try:
                    if DOWNLOAD_GATE is not None: DOWNLOAD_GATE.acquire()
                    with fetch(item["url"], 30) as response:
                        data = response.read(2 * 1024 * 1024 + 1)
                    if len(data) > 2 * 1024 * 1024 or not data.startswith(b"OggS"):
                        raise ValueError("Invalid or oversized OGG audio")
                    temporary = destination.with_suffix(".download")
                    temporary.write_bytes(data); temporary.replace(destination); break
                except Exception as error:
                    if isinstance(error, urllib.error.HTTPError) and error.code == 429:
                        if DOWNLOAD_GATE is not None: DOWNLOAD_GATE.defer(error.headers.get("Retry-After", "60"))
                        else: time.sleep(60)
                    elif isinstance(error, urllib.error.HTTPError) and error.code in (400, 403, 404, 410):
                        raise
                    else:
                        time.sleep(min(30, 2 ** attempt))
                    if attempt == 5: raise
        data = destination.read_bytes()
        if not data.startswith(b"OggS"): raise ValueError("Invalid cached OGG")
        digest = hashlib.sha256(data).hexdigest()
        published = HERE / "audio" / (identity + ".ogg")
        if not published.exists(): shutil.copyfile(destination, published)
        return {**item, "id": identity, "relativePath": "audio/" + published.name, "bytes": len(data), "sha256": digest, "processing": "Wikimedia OGG rendition; no waveform editing" if "/transcoded/" in item["url"] else "Original recording; no audio modification"}
    except Exception as error:
        return {"file": item["file"], "word": item["word"], "error": str(error)}


def pack(download_max=0, workers=4, interval=0.25):
    global DOWNLOAD_GATE
    DOWNLOAD_GATE = DownloadGate(interval)
    candidates = json.loads((CACHE / "candidates.json").read_text(encoding="utf-8"))
    names = sorted({item["file"] for item in candidates})
    (HERE / "audio").mkdir(exist_ok=True)
    downloaded, errors = {}, []
    by_name = {item["file"]: item for item in candidates}
    licensed = metadata(names)
    references = {}
    for name, info in licensed.items():
        candidate = by_name[name]
        original = urllib.parse.urlparse(info["originalUrl"])
        url = urllib.parse.urlunparse(original._replace(query="")) if original.path.lower().endswith((".ogg", ".oga")) else candidate["url"]
        identity = hashlib.sha256(name.encode()).hexdigest()
        references[name] = {**candidate, **info, "url": url, "id": identity, "relativePath": "audio/" + identity + ".ogg", "bytes": 0, "sha256": "", "processing": "Wikimedia OGG rendition; no waveform editing" if "/transcoded/" in url else "Original recording; no audio modification"}
    selected = []
    remaining = download_max
    for name, item in references.items():
        cached = (CACHE / "audio" / (item["id"] + ".ogg")).exists()
        if cached or remaining > 0:
            selected.append(item)
            if not cached: remaining -= 1
    started = time.time()
    # Source originals first; derivative audio is fetched afterwards, using the
    # same global gate. Do not switch hosts or retry around an active cooldown.
    selected.sort(key=lambda item: ("/transcoded/" in item["url"], item["file"]))
    with ThreadPoolExecutor(max_workers=max(1, min(4, workers))) as pool:
        futures = [pool.submit(download, item) for item in selected]
        for number, future in enumerate(as_completed(futures), 1):
            result = future.result()
            if "error" in result: errors.append(result)
            else: downloaded[result["file"]] = result
            progress = {"phase": "downloading", "startedAt": datetime.fromtimestamp(started, timezone.utc).isoformat(), "updatedAt": datetime.now(timezone.utc).isoformat(), "selected": len(selected), "processed": number, "cachedRecordings": len(downloaded), "failed": len(errors), "bytes": sum(value["bytes"] for value in downloaded.values()), "cooldownUntil": DOWNLOAD_GATE.cooldown, "lastFile": result["file"]}
            json_write(CACHE / "download-progress.json", progress)
            if number % 25 == 0 or number == len(selected): print(f"Audio files: {number}/{len(selected)} ({len(downloaded)} cached, {len(errors)} unavailable, {progress['bytes'] / 1024**2:.1f} MiB)", flush=True)
    recordings = [{**item, **references[item["file"]], **downloaded.get(item["file"], {})} for item in candidates if item["file"] in references]
    # The per-word metadata must come from that word's index entry, not whichever
    # duplicate filename was downloaded last (files may be shared by word forms).
    for item, candidate in zip(recordings, [v for v in candidates if v["file"] in references]):
        for field in ("word", "accent", "tags", "pos", "label", "ipa"): item[field] = candidate[field]
    target = HERE / "catalog.sqlite"; temporary = HERE / "catalog.building.sqlite"
    temporary.unlink(missing_ok=True)
    db = sqlite3.connect(temporary)
    db.executescript("CREATE TABLE recordings(word_key TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(word_key,id)) WITHOUT ROWID; CREATE TABLE metadata(name TEXT PRIMARY KEY,value TEXT NOT NULL) WITHOUT ROWID;")
    for item in recordings: db.execute("INSERT OR IGNORE INTO recordings VALUES (?,?,?)", (item["word"], item["id"], json.dumps(item, ensure_ascii=False)))
    words = {item["word"] for item in recordings}; wanted = json.loads((CACHE / "targets.json").read_text(encoding="utf-8"))
    manifest = {"schema": 1, "source": "Wiktionary / Wikimedia Commons", "builtAt": datetime.now(timezone.utc).isoformat(), "targetWords": len(wanted), "wordsWithAudio": len(words), "wordsWithLocalAudio": len({v['word'] for v in recordings if v['bytes']}), "recordings": len(references), "cachedRecordings": len(downloaded), "bytes": sum(v["bytes"] for v in downloaded.values()), "heteronyms": sorted(HETERONYMS), "coverage": {book: {"total": sum(book in b for b in wanted.values()), "matched": sum(word in words and book in books for word,books in wanted.items())} for book in ("cet4", "cet6", "sample")}, "indexSource": json.loads((CACHE / "source.json").read_text(encoding="utf-8"))}
    db.execute("INSERT INTO metadata VALUES ('manifest',?)", (json.dumps(manifest),)); db.commit()
    if db.execute("PRAGMA quick_check").fetchone()[0] != "ok": raise RuntimeError("Invalid audio catalog")
    db.close(); temporary.replace(target)
    manifest["catalogSha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
    json_write(HERE / "manifest.json", manifest); json_write(CACHE / "download-errors.json", errors)
    json_write(HERE / "ATTRIBUTION.json", [{**{key: value[key] for key in ("id", "file", "sourceUrl", "author", "license", "licenseUrl", "credit", "attribution", "processing")}, "bytes": downloaded.get(name, {}).get("bytes", 0), "sha256": downloaded.get(name, {}).get("sha256", "")} for name,value in references.items()])
    print(json.dumps(manifest), flush=True)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("phase", choices=("index", "pack", "all"), default="all", nargs="?"); parser.add_argument("--download-max", type=int, default=0); parser.add_argument("--workers", type=int, default=4); parser.add_argument("--request-interval", type=float, default=0.25); args = parser.parse_args()
    if args.phase in ("index", "all"): index()
    if args.phase in ("pack", "all"): pack(args.download_max, args.workers, args.request_interval)
