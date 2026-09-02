"""HTTP contract tests against the dev backend, driven with real
WebM/Opus uploads so the decode path runs for real."""

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("STT_BACKEND", "dev")

from fastapi.testclient import TestClient   # noqa: E402

from app import settings as settings_mod    # noqa: E402
from app.main import app                    # noqa: E402
from conftest import encode                 # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def post(client, data, filename="utterance.webm", lang="fa-IR"):
    return client.post(
        "/transcribe",
        files={"audio": (filename, data, "audio/webm")},
        data={"lang": lang},
    )


class TestHealth:
    def test_reports_backend_and_readiness(self, client):
        body = client.get("/health").json()
        assert body["status"] == "ok"
        assert body["backend"] == "dev"
        assert body["production_ready"] is False
        assert body["language"] == "fa"


class TestContract:
    def test_returns_the_field_the_client_reads(self, client, webm_speechlike):
        # app/js/stt.js reads exactly data.text and nothing else
        body = post(client, webm_speechlike).json()
        assert "text" in body and isinstance(body["text"], str)
        assert body["text"]

    def test_reports_duration_and_speed(self, client, webm_speechlike):
        body = post(client, webm_speechlike).json()
        assert 1.4 < body["duration"] < 1.8
        assert body["rtf"] >= 0

    def test_multipart_field_names_match_the_client(self, client, webm_speechlike):
        # the client sends fd.append('audio', blob) and fd.append('lang', tag)
        r = client.post("/transcribe", files={"audio": ("u.webm", webm_speechlike, "audio/webm")})
        assert r.status_code == 200, "lang must be optional, the client may omit it"


class TestSilenceIsNotAnError:
    def test_silence_returns_empty_text_with_200(self, client, webm_silence):
        r = post(client, webm_silence)
        assert r.status_code == 200
        body = r.json()
        assert body["text"] == ""
        assert body["rejected"] is True
        assert body["reason"]

    def test_clip_too_short_returns_empty_text_with_200(self, client, webm_short):
        body = post(client, webm_short).json()
        assert body["text"] == ""
        assert body["rejected"] is True


class TestRejections:
    def test_garbage_upload_is_a_bad_request(self, client):
        r = post(client, b"not audio" * 100)
        assert r.status_code == 400

    def test_empty_upload_is_a_bad_request(self, client):
        r = post(client, b"")
        assert r.status_code == 400

    def test_oversized_upload_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings_mod.settings, "max_upload_mb", 0)
        assert post(client, encode(0.5)).status_code == 413

    def test_overlong_clip_rejected(self, client, monkeypatch):
        monkeypatch.setattr(settings_mod.settings, "max_seconds", 0.5)
        assert post(client, encode(1.5)).status_code == 413

    def test_missing_file_rejected(self, client):
        assert client.post("/transcribe", data={"lang": "fa-IR"}).status_code == 422


class TestSafariCompatibility:
    def test_accepts_mp4_aac_from_safari(self, client):
        data = encode(1.2, container="mp4", codec="aac")
        r = client.post("/transcribe", files={"audio": ("u.mp4", data, "audio/mp4")})
        assert r.status_code == 200
        assert r.json()["text"]
