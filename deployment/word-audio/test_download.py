"""Offline regression checks for shared pacing and resumable downloads."""
from __future__ import annotations
from contextlib import redirect_stdout
from email.utils import formatdate
import hashlib
from io import BytesIO, StringIO
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import prepare_audio as builder


class DownloadTests(unittest.TestCase):
    def setUp(self):
        parent = builder.ROOT / ".impeccable/review/word-audio-20261024"
        parent.mkdir(parents=True, exist_ok=True)
        self.folder = Path(tempfile.mkdtemp(prefix="bulk-download-test-", dir=parent))
        self.cache = self.folder / "sources"
        self.cache.mkdir()
        (self.folder / "audio").mkdir()
        self.now = 100.0
        self.sleeps = []

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds

    def context(self):
        return patch.multiple(builder, HERE=self.folder, CACHE=self.cache)

    def test_short_retry_after_does_not_override_a_longer_shared_cooldown(self):
        with self.context(), patch.object(builder.time, "time", lambda: self.now), patch.object(builder.time, "sleep", self.sleep), redirect_stdout(StringIO()):
            gate = builder.DownloadGate(1.2)
            gate.defer("600")
            gate.defer("1")
            restored = builder.DownloadGate(1.2)
            self.assertEqual(restored.cooldown, 700)
            restored.acquire()
            self.assertEqual(self.now, 700)
            self.assertTrue(all(seconds <= 30 for seconds in self.sleeps))

    def test_http_date_retry_after_is_honored(self):
        with self.context(), patch.object(builder.time, "time", lambda: self.now), redirect_stdout(StringIO()):
            gate = builder.DownloadGate()
            gate.defer(formatdate(900, usegmt=True))
            self.assertEqual(gate.cooldown, 900)

    def test_pacing_applies_between_workers_request_starts(self):
        with self.context(), patch.object(builder.time, "time", lambda: self.now), patch.object(builder.time, "sleep", self.sleep):
            gate = builder.DownloadGate(1.2)
            starts = []
            for _ in range(3):
                gate.acquire()
                starts.append(self.now)
            for first, second in zip(starts, starts[1:]):
                self.assertAlmostEqual(second - first, 1.2)

    def test_existing_download_is_reused_with_the_same_checksum(self):
        item = {"file": "fixture.ogg", "word": "fixture", "url": "https://upload.wikimedia.org/wikipedia/commons/1/12/fixture.ogg"}
        audio = b"OggS offline download fixture"
        with self.context(), patch.object(builder, "fetch", return_value=BytesIO(audio)) as fetch:
            first = builder.download(item)
            self.assertEqual(first["sha256"], hashlib.sha256(audio).hexdigest())
            second = builder.download(item)
            self.assertEqual(second, first)
            self.assertEqual(fetch.call_count, 1)
            self.assertEqual((self.folder / first["relativePath"]).read_bytes(), audio)

    def test_after_a_429_no_next_request_starts_before_retry_after(self):
        item = {"file": "retry.ogg", "word": "retry", "url": "https://upload.wikimedia.org/wikipedia/commons/1/12/retry.ogg"}
        calls = []
        def fetch(url, timeout):
            calls.append(self.now)
            if len(calls) == 1:
                raise urllib.error.HTTPError(url, 429, "Rate limited", {"Retry-After": "600"}, None)
            return BytesIO(b"OggS retry fixture")
        with self.context(), patch.object(builder.time, "time", lambda: self.now), patch.object(builder.time, "sleep", self.sleep), redirect_stdout(StringIO()):
            gate = builder.DownloadGate(1.2)
            with patch.object(builder, "DOWNLOAD_GATE", gate), patch.object(builder, "fetch", fetch):
                result = builder.download(item)
            self.assertNotIn("error", result)
            self.assertGreaterEqual(calls[1] - calls[0], 600)


if __name__ == "__main__":
    unittest.main()
