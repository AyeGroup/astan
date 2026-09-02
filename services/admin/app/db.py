"""SQLite storage and the dashboard queries.

SQLite rather than Postgres because the whole workload is one write per
visitor question and a handful of grouped reads per dashboard view. That
fits a single file with WAL enabled for years, and it removes a service a
museum's IT would otherwise have to run. Migrating later is a day's work;
running Postgres from day one is a cost every deployment pays.

The question fingerprint is computed once at ingest and stored on the row,
so the report a museum actually reads is a GROUP BY rather than a scan
that re-tokenises every question on every page load.
"""

from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from .cluster import fingerprint

SCHEMA = """
CREATE TABLE IF NOT EXISTS museums (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    bot_uuid    TEXT NOT NULL UNIQUE,
    avatar      TEXT NOT NULL DEFAULT 'mehrbanoo',
    langs       TEXT NOT NULL DEFAULT '["fa"]',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS objects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    museum_id   INTEGER NOT NULL REFERENCES museums(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    title       TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    hall        TEXT NOT NULL DEFAULT '',
    avatar      TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    UNIQUE (museum_id, code)
);

CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    museum_id       INTEGER NOT NULL REFERENCES museums(id) ON DELETE CASCADE,
    object_code     TEXT NOT NULL DEFAULT '',
    kind            TEXT NOT NULL,
    question        TEXT NOT NULL DEFAULT '',
    fingerprint     TEXT NOT NULL DEFAULT '',
    lang            TEXT NOT NULL DEFAULT 'fa',
    latency_ms      INTEGER,
    first_speech_ms INTEGER,
    session_id      TEXT NOT NULL DEFAULT '',
    created_at      REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_events_museum_time ON events (museum_id, created_at);
CREATE INDEX IF NOT EXISTS ix_events_object      ON events (museum_id, object_code);
CREATE INDEX IF NOT EXISTS ix_events_fingerprint ON events (museum_id, fingerprint);
CREATE INDEX IF NOT EXISTS ix_events_session     ON events (session_id, created_at);
"""


class Database:
    def __init__(self, path: str | Path):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._shared = sqlite3.connect(self.path, check_same_thread=False) if self.path == ":memory:" else None
        with self.connect() as cx:
            cx.executescript(SCHEMA)
            if self.path != ":memory:":
                # WAL lets the dashboard read while visitor events are writing
                cx.execute("PRAGMA journal_mode=WAL")
            cx.execute("PRAGMA foreign_keys=ON")

    @contextmanager
    def connect(self):
        cx = self._shared or sqlite3.connect(self.path, timeout=10)
        cx.row_factory = sqlite3.Row
        try:
            yield cx
            cx.commit()
        finally:
            if not self._shared:
                cx.close()

    # ------------------------------------------------------------ museums

    def create_museum(self, slug: str, name: str, bot_uuid: str,
                      avatar: str = "mehrbanoo", langs: Optional[List[str]] = None) -> Dict[str, Any]:
        with self.connect() as cx:
            cx.execute(
                "INSERT INTO museums (slug, name, bot_uuid, avatar, langs, created_at)"
                " VALUES (?,?,?,?,?,?)",
                (slug, name, bot_uuid, avatar, json.dumps(langs or ["fa"]), _now_iso()),
            )
        return self.museum(slug)

    def museum(self, slug: str) -> Optional[Dict[str, Any]]:
        with self.connect() as cx:
            row = cx.execute("SELECT * FROM museums WHERE slug=?", (slug,)).fetchone()
        return _museum(row)

    def museum_by_bot(self, bot_uuid: str) -> Optional[Dict[str, Any]]:
        with self.connect() as cx:
            row = cx.execute("SELECT * FROM museums WHERE bot_uuid=?", (bot_uuid,)).fetchone()
        return _museum(row)

    def museums(self) -> List[Dict[str, Any]]:
        with self.connect() as cx:
            rows = cx.execute("SELECT * FROM museums ORDER BY name").fetchall()
        return [_museum(r) for r in rows]

    # ------------------------------------------------------------- objects

    def upsert_object(self, museum_id: int, code: str, title: str,
                      note: str = "", hall: str = "", avatar: str = "") -> Dict[str, Any]:
        with self.connect() as cx:
            cx.execute(
                "INSERT INTO objects (museum_id, code, title, note, hall, avatar, created_at)"
                " VALUES (?,?,?,?,?,?,?)"
                " ON CONFLICT(museum_id, code) DO UPDATE SET"
                "   title=excluded.title, note=excluded.note,"
                "   hall=excluded.hall, avatar=excluded.avatar",
                (museum_id, code, title, note, hall, avatar, _now_iso()),
            )
            row = cx.execute(
                "SELECT * FROM objects WHERE museum_id=? AND code=?", (museum_id, code)
            ).fetchone()
        return dict(row)

    def objects(self, museum_id: int) -> List[Dict[str, Any]]:
        with self.connect() as cx:
            rows = cx.execute(
                "SELECT o.*, ("
                "  SELECT COUNT(*) FROM events e"
                "  WHERE e.museum_id=o.museum_id AND e.object_code=o.code AND e.kind='question'"
                ") AS questions"
                " FROM objects o WHERE o.museum_id=? ORDER BY o.code",
                (museum_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def delete_object(self, museum_id: int, code: str) -> bool:
        with self.connect() as cx:
            cur = cx.execute("DELETE FROM objects WHERE museum_id=? AND code=?", (museum_id, code))
        return cur.rowcount > 0

    # -------------------------------------------------------------- events

    def record(self, museum_id: int, payload: Dict[str, Any]) -> None:
        question = (payload.get("q") or payload.get("question") or "").strip()
        with self.connect() as cx:
            cx.execute(
                "INSERT INTO events (museum_id, object_code, kind, question, fingerprint,"
                " lang, latency_ms, first_speech_ms, session_id, created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    museum_id,
                    str(payload.get("object") or ""),
                    str(payload.get("event") or "question"),
                    question,
                    fingerprint(question) if question else "",
                    str(payload.get("lang") or "fa"),
                    _int(payload.get("ms")),
                    _int(payload.get("firstSpeechMs")),
                    str(payload.get("session") or payload.get("session_id") or ""),
                    time.time(),
                ),
            )

    # ----------------------------------------------------------- dashboard

    def dashboard(self, museum_id: int, days: int = 30, limit: int = 20) -> Dict[str, Any]:
        since = time.time() - days * 86400
        with self.connect() as cx:
            return {
                "totals": self._totals(cx, museum_id, since),
                "top_questions": self._top_questions(cx, museum_id, since, limit),
                "top_objects": self._top_objects(cx, museum_id, since, limit),
                "content_gaps": self._content_gaps(cx, museum_id, since, limit),
                "languages": self._languages(cx, museum_id, since),
                "by_hour": self._by_hour(cx, museum_id, since),
                "latency": self._latency(cx, museum_id, since),
                "days": days,
            }

    def _totals(self, cx, museum_id, since):
        row = cx.execute(
            "SELECT COUNT(*) AS questions,"
            "       COUNT(DISTINCT session_id) AS sessions,"
            "       COUNT(DISTINCT object_code) AS objects"
            " FROM events WHERE museum_id=? AND kind='question' AND created_at>=?",
            (museum_id, since),
        ).fetchone()
        out = dict(row)
        out["per_session"] = round(out["questions"] / out["sessions"], 2) if out["sessions"] else 0
        return out

    def _top_questions(self, cx, museum_id, since, limit):
        # the shortest surviving phrasing represents the group: a real
        # sentence a visitor said, never a reconstruction
        rows = cx.execute(
            "SELECT fingerprint, COUNT(*) AS n,"
            "       (SELECT question FROM events e2"
            "         WHERE e2.museum_id=e.museum_id AND e2.fingerprint=e.fingerprint"
            "           AND e2.created_at>=? AND e2.question<>''"
            "         ORDER BY LENGTH(e2.question) LIMIT 1) AS question,"
            "       COUNT(DISTINCT question) AS variants"
            " FROM events e"
            " WHERE museum_id=? AND kind='question' AND created_at>=? AND fingerprint<>''"
            " GROUP BY fingerprint ORDER BY n DESC, question LIMIT ?",
            (since, museum_id, since, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def _top_objects(self, cx, museum_id, since, limit):
        rows = cx.execute(
            "SELECT e.object_code AS code, COUNT(*) AS n,"
            "       COALESCE(o.title, '') AS title,"
            "       COUNT(DISTINCT e.session_id) AS sessions"
            " FROM events e LEFT JOIN objects o"
            "   ON o.museum_id=e.museum_id AND o.code=e.object_code"
            " WHERE e.museum_id=? AND e.kind='question' AND e.created_at>=? AND e.object_code<>''"
            " GROUP BY e.object_code ORDER BY n DESC LIMIT ?",
            (museum_id, since, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def _content_gaps(self, cx, museum_id, since, limit):
        """Questions a visitor had to follow up on within half a minute.

        A visitor who immediately asks again usually did not get what they
        wanted, so this ranks where the museum's own content is thin. It
        needs no extra signal from the client, which is why it works at all.
        """
        rows = cx.execute(
            "SELECT e.fingerprint, COUNT(*) AS n,"
            "       (SELECT question FROM events e3"
            "         WHERE e3.museum_id=e.museum_id AND e3.fingerprint=e.fingerprint"
            "           AND e3.question<>'' ORDER BY LENGTH(e3.question) LIMIT 1) AS question"
            " FROM events e"
            " WHERE e.museum_id=? AND e.kind='question' AND e.created_at>=?"
            "   AND e.fingerprint<>'' AND e.session_id<>''"
            "   AND EXISTS ("
            "     SELECT 1 FROM events f"
            "      WHERE f.session_id=e.session_id AND f.kind='question'"
            "        AND f.id<>e.id AND f.fingerprint<>e.fingerprint"
            "        AND f.created_at > e.created_at"
            "        AND f.created_at - e.created_at <= 30)"
            " GROUP BY e.fingerprint ORDER BY n DESC LIMIT ?",
            (museum_id, since, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def _languages(self, cx, museum_id, since):
        rows = cx.execute(
            "SELECT lang, COUNT(*) AS n FROM events"
            " WHERE museum_id=? AND kind='question' AND created_at>=?"
            " GROUP BY lang ORDER BY n DESC",
            (museum_id, since),
        ).fetchall()
        return [dict(r) for r in rows]

    def _by_hour(self, cx, museum_id, since):
        rows = cx.execute(
            "SELECT CAST(strftime('%H', created_at, 'unixepoch') AS INTEGER) AS hour,"
            "       COUNT(*) AS n FROM events"
            " WHERE museum_id=? AND kind='question' AND created_at>=?"
            " GROUP BY hour ORDER BY hour",
            (museum_id, since),
        ).fetchall()
        counts = {r["hour"]: r["n"] for r in rows}
        return [{"hour": h, "n": counts.get(h, 0)} for h in range(24)]

    def _latency(self, cx, museum_id, since):
        rows = cx.execute(
            "SELECT first_speech_ms FROM events"
            " WHERE museum_id=? AND kind='question' AND created_at>=?"
            "   AND first_speech_ms IS NOT NULL AND first_speech_ms > 0"
            " ORDER BY first_speech_ms",
            (museum_id, since),
        ).fetchall()
        values = [r["first_speech_ms"] for r in rows]
        if not values:
            return {"samples": 0, "p50": None, "p95": None}
        return {
            "samples": len(values),
            "p50": values[int(len(values) * 0.50)],
            "p95": values[min(len(values) - 1, int(len(values) * 0.95))],
        }


def _museum(row) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    out = dict(row)
    out["langs"] = json.loads(out.get("langs") or '["fa"]')
    return out


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
