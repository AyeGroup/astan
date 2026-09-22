"""لایهٔ دسترسی به Postgres.

نکتهٔ قاعدهٔ ۷: هیچ نرمال‌سازی فارسی‌ای اینجا یا هر جای دیگر لایهٔ اپ نوشته
نمی‌شود. تنها مسیر، فراخوانی ``normalize_fa()`` در خود دیتابیس است.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import get_settings

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        s = get_settings()
        _pool = ConnectionPool(
            s.database_url,
            min_size=s.db_pool_min,
            max_size=s.db_pool_max,
            kwargs={"row_factory": dict_row},
            open=True,
        )
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def connection() -> Iterator[Connection]:
    with get_pool().connection() as conn:
        yield conn


def fetch_all(sql: str, params: Any = None) -> list[dict]:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def fetch_one(sql: str, params: Any = None) -> dict | None:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def execute(sql: str, params: Any = None) -> int:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount


def normalize_fa(text: str) -> str:
    """تنها نقطهٔ ورود به نرمال‌سازی — و آن هم در دیتابیس اجرا می‌شود."""
    row = fetch_one("SELECT normalize_fa(%s) AS t", (text,))
    return (row or {}).get("t") or ""
