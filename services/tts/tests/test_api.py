"""HTTP contract tests, run against the dev backend so no voice model is
needed. The dev backend uses the real espeak phonemiser, so the viseme
timeline under test is genuine even though the waveform is not speech."""

import base64
import io
import os
import sys
import wave
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("TTS_BACKEND", "dev")
os.environ.setdefault("TTS_CACHE_DIR", str(ROOT / ".pytest-cache-audio"))

from fastapi.testclient import TestClient   # noqa: E402

from app.main import app, cache             # noqa: E402


@pytest.fixture(scope="module")
def client():
    cache.clear()
    with TestClient(app) as c:
        yield c
    cache.clear()


class TestHealth:
    def test_health_reports_backend(self, client):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["backend"] == "dev"
        # the dev backend must never be mistaken for a deployable one
        assert body["production_ready"] is False

    def test_voices_lists_aliases(self, client):
        body = client.get("/voices").json()
        assert "fa-IR" in body["aliases"]


class TestSpeak:
    def test_returns_a_playable_wav(self, client):
        r = client.post("/speak", json={"text": "سلام، به موزه خوش آمدید."})
        assert r.status_code == 200
        assert r.headers["content-type"] == "audio/wav"
        with wave.open(io.BytesIO(r.content)) as wf:
            assert wf.getnframes() > 0
            assert wf.getframerate() > 8000

    def test_browser_language_tag_resolves_to_a_voice(self, client):
        # app/js/tts.js sends the BCP-47 tag when no voice is configured
        r = client.post("/speak", json={"text": "سلام", "voice": "fa-IR"})
        assert r.status_code == 200

    def test_json_format_carries_a_viseme_timeline(self, client):
        r = client.post("/speak", json={"text": "مامان بابا", "format": "json"})
        body = r.json()
        assert body["mime"] == "audio/wav"
        assert base64.b64decode(body["audio"])[:4] == b"RIFF"
        assert body["duration"] > 0
        assert len(body["timeline"]) > 3
        for entry in body["timeline"]:
            assert 0.0 <= entry["o"] <= 1.0 and 0.0 <= entry["s"] <= 1.0
        assert [e["t"] for e in body["timeline"]] == sorted(e["t"] for e in body["timeline"])

    def test_bilabials_close_the_mouth(self, client):
        """The whole point of using alignments instead of audio energy."""
        body = client.post("/speak", json={"text": "مامان بابا", "format": "json"}).json()
        assert min(e["o"] for e in body["timeline"]) < 0.1, "lips must close on م/ب/پ"

    def test_markdown_is_normalised_before_synthesis(self, client):
        body = client.post(
            "/speak", json={"text": "**کاسهٔ صفوی** [۱]", "format": "json"}
        ).json()
        assert body["normalized"] == "کاسهٔ صفوی"

    def test_rate_changes_duration(self, client):
        slow = client.post("/speak", json={"text": "سلام دوباره", "rate": 0.7, "format": "json"}).json()
        fast = client.post("/speak", json={"text": "سلام دوباره", "rate": 1.5, "format": "json"}).json()
        assert slow["duration"] > fast["duration"]

    def test_empty_text_rejected(self, client):
        assert client.post("/speak", json={"text": ""}).status_code == 422

    def test_unspeakable_text_rejected(self, client):
        assert client.post("/speak", json={"text": "!!! ???"}).status_code == 422

    def test_out_of_range_rate_rejected(self, client):
        assert client.post("/speak", json={"text": "سلام", "rate": 9}).status_code == 422


class TestCache:
    def test_second_request_is_a_cache_hit(self, client):
        text = "این جمله برای آزمون کش است."
        first = client.post("/speak", json={"text": text})
        second = client.post("/speak", json={"text": text})
        assert first.headers["X-Cache"] == "miss"
        assert second.headers["X-Cache"] == "hit"
        assert first.content == second.content

    def test_cache_key_ignores_markdown_differences(self, client):
        client.post("/speak", json={"text": "متن مشترک برای کش"})
        r = client.post("/speak", json={"text": "**متن مشترک برای کش**"})
        assert r.headers["X-Cache"] == "hit", "normalisation must happen before the cache key"

    def test_prerender_warms_the_cache(self, client):
        texts = ["ساعت کار موزه چیست؟", "سرویس بهداشتی کجاست؟"]
        body = client.post("/prerender", json={"texts": texts}).json()
        assert body["prerendered"] == 2
        assert client.post("/speak", json={"text": texts[0]}).headers["X-Cache"] == "hit"

    def test_prerender_reports_failures_without_aborting(self, client):
        body = client.post("/prerender", json={"texts": ["سلام", "!!!"]}).json()
        assert body["prerendered"] == 1
        assert len(body["failed"]) == 1
