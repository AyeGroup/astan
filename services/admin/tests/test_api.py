"""HTTP contract and the dashboard queries, on a throwaway database."""

import os
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_DB", str(tmp_path / "t.sqlite3"))
    monkeypatch.setenv("ADMIN_TOKEN", "test-token-long-enough-to-pass")
    monkeypatch.setenv("VIEWER_URL", "https://m.example.com/app/viewer.html")
    for mod in [m for m in list(sys.modules) if m.startswith("app.")]:
        del sys.modules[mod]
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        c.headers.update({"X-Admin-Token": "test-token-long-enough-to-pass"})
        yield c


BOT = "51585baf-c08c-4e4a-ab21-f1e704831154"


def seed(client):
    client.post("/api/museums", json={"slug": "astan", "name": "موزهٔ آستان", "bot_uuid": BOT})
    client.put("/api/museums/astan/objects/obj-114",
               json={"code": "obj-114", "title": "کاسهٔ لعاب‌دار صفوی", "hall": "گالری ۲"})
    return client


def ask(client, question, *, obj="obj-114", session="s1", lang="fa", first=900):
    return client.post("/events", json={
        "event": "question", "q": question, "object": obj, "bot": BOT,
        "lang": lang, "ms": 1400, "firstSpeechMs": first, "session": session,
    })


class TestAuth:
    def test_api_requires_the_token(self, client):
        bare = client.get("/api/museums", headers={"X-Admin-Token": "wrong"})
        assert bare.status_code == 401

    def test_event_intake_is_public(self, client):
        seed(client)
        r = client.post("/events", json={"event": "question", "q": "سلام", "bot": BOT},
                        headers={"X-Admin-Token": ""})
        assert r.status_code == 204


class TestObjects:
    def test_creates_and_lists(self, client):
        seed(client)
        body = client.get("/api/museums/astan/objects").json()
        assert body["objects"][0]["title"] == "کاسهٔ لعاب‌دار صفوی"

    def test_builds_the_qr_link_for_the_operator(self, client):
        seed(client)
        url = client.get("/api/museums/astan/objects").json()["objects"][0]["viewer_url"]
        assert url.startswith("https://m.example.com/app/viewer.html?")
        assert f"bot={BOT}" in url and "obj=obj-114" in url

    def test_put_is_an_upsert(self, client):
        seed(client)
        client.put("/api/museums/astan/objects/obj-114",
                   json={"code": "obj-114", "title": "عنوان تازه"})
        objects = client.get("/api/museums/astan/objects").json()["objects"]
        assert len(objects) == 1 and objects[0]["title"] == "عنوان تازه"

    def test_code_must_match_the_path(self, client):
        seed(client)
        r = client.put("/api/museums/astan/objects/obj-114",
                       json={"code": "other", "title": "x"})
        assert r.status_code == 400

    def test_csv_matches_what_make_qr_expects(self, client):
        seed(client)
        csv = client.get("/api/museums/astan/qr.csv").text
        assert csv.splitlines()[0] == "object_id,title,avatar,lang"
        assert "obj-114" in csv

    def test_delete(self, client):
        seed(client)
        assert client.delete("/api/museums/astan/objects/obj-114").status_code == 200
        assert client.get("/api/museums/astan/objects").json()["objects"] == []


class TestIntake:
    def test_unknown_bot_is_silently_dropped(self, client):
        seed(client)
        r = client.post("/events", json={"event": "question", "q": "x", "bot": "not-a-bot"})
        # 204 rather than 404: this endpoint is public, and a 404 would
        # confirm which bot ids exist
        assert r.status_code == 204
        assert client.get("/api/museums/astan/dashboard").json()["totals"]["questions"] == 0

    def test_oversized_payload_rejected(self, client):
        seed(client)
        r = client.post("/events", json={"event": "question", "q": "x" * 9000, "bot": BOT})
        assert r.status_code == 413

    def test_accepts_the_payload_the_viewer_already_sends(self, client):
        seed(client)
        assert ask(client, "قدمت این اثر چقدر است؟").status_code == 204
        assert client.get("/api/museums/astan/dashboard").json()["totals"]["questions"] == 1


class TestDashboard:
    def test_groups_variants_of_one_question(self, client):
        seed(client)
        for q in ["چایخانه کجاست؟", "کجاست چای‌خانه", "چایخانه‌ها کجا هستند؟"]:
            ask(client, q)
        top = client.get("/api/museums/astan/dashboard").json()["top_questions"]
        assert top[0]["n"] == 3
        assert top[0]["variants"] == 3
        assert top[0]["question"] in ["چایخانه کجاست؟", "کجاست چای‌خانه", "چایخانه‌ها کجا هستند؟"]

    def test_ranks_objects_by_attention(self, client):
        seed(client)
        client.put("/api/museums/astan/objects/obj-9", json={"code": "obj-9", "title": "کتیبه"})
        for _ in range(3):
            ask(client, "این چیست؟", obj="obj-114")
        ask(client, "این چیست؟", obj="obj-9")
        objs = client.get("/api/museums/astan/dashboard").json()["top_objects"]
        assert objs[0]["code"] == "obj-114" and objs[0]["n"] == 3
        assert objs[0]["title"] == "کاسهٔ لعاب‌دار صفوی"

    def test_content_gap_needs_a_quick_follow_up(self, client):
        seed(client)
        ask(client, "قدمت این اثر چقدر است؟", session="s7")
        ask(client, "جنس بدنه چیست؟", session="s7")
        gaps = client.get("/api/museums/astan/dashboard").json()["content_gaps"]
        # the first question was followed up on, the last one was not
        assert [g["question"] for g in gaps] == ["قدمت این اثر چقدر است؟"]

    def test_unrelated_sessions_are_not_a_follow_up(self, client):
        seed(client)
        ask(client, "قدمت این اثر چقدر است؟", session="a")
        ask(client, "جنس بدنه چیست؟", session="b")
        assert client.get("/api/museums/astan/dashboard").json()["content_gaps"] == []

    def test_latency_percentiles(self, client):
        seed(client)
        for ms in [700, 800, 900, 1000, 4000]:
            ask(client, f"پرسش {ms}", first=ms)
        lat = client.get("/api/museums/astan/dashboard").json()["latency"]
        assert lat["samples"] == 5 and lat["p50"] == 900 and lat["p95"] == 4000

    def test_language_split(self, client):
        seed(client)
        ask(client, "این چیست؟", lang="fa")
        ask(client, "what is this?", lang="en")
        ask(client, "what is that?", lang="en")
        langs = {r["lang"]: r["n"] for r in client.get("/api/museums/astan/dashboard").json()["languages"]}
        assert langs == {"en": 2, "fa": 1}

    def test_hour_histogram_covers_the_whole_day(self, client):
        seed(client)
        ask(client, "این چیست؟")
        by_hour = client.get("/api/museums/astan/dashboard").json()["by_hour"]
        assert len(by_hour) == 24
        assert sum(h["n"] for h in by_hour) == 1

    def test_empty_museum_does_not_crash(self, client):
        seed(client)
        data = client.get("/api/museums/astan/dashboard").json()
        assert data["totals"]["questions"] == 0
        assert data["latency"]["p50"] is None


class TestFailsClosed:
    """An unauthenticated admin API exposes every museum's objects and
    reports to anyone who can reach the port. A log warning is not enough."""

    def _settings(self, token="", allow_open=False):
        from app.settings import Settings
        cfg = Settings()
        cfg.admin_token = token
        cfg.allow_open = allow_open
        return cfg

    def test_refuses_to_start_without_a_token(self):
        from app.settings import Misconfigured, require_configuration
        with pytest.raises(Misconfigured) as err:
            require_configuration(self._settings())
        assert "ADMIN_TOKEN" in str(err.value)
        assert "token_urlsafe" in str(err.value), "the error must say how to fix it"

    def test_refuses_a_token_short_enough_to_guess(self):
        from app.settings import Misconfigured, require_configuration
        with pytest.raises(Misconfigured):
            require_configuration(self._settings(token="secret"))

    def test_accepts_a_real_token(self):
        from app.settings import require_configuration
        require_configuration(self._settings(token="v" * 32))

    def test_open_mode_requires_an_explicit_opt_in(self):
        from app.settings import require_configuration
        require_configuration(self._settings(allow_open=True))
