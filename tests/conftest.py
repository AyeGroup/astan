"""زیرساخت تست.

هر اجرا روی یک دیتابیس جداگانه (``daadno_test``) انجام می‌شود که از صفر از
مهاجرت‌ها ساخته می‌شود؛ تست هرگز به دیتابیس توسعه دست نمی‌زند.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))

ADMIN_URL = os.environ.get(
    "DAADNO_TEST_ADMIN_URL", "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
)
TEST_DB = os.environ.get("DAADNO_TEST_DB", "daadno_test")


def _url_for(database: str) -> str:
    parts = urlsplit(ADMIN_URL)
    return urlunsplit((parts.scheme, parts.netloc, f"/{database}", parts.query, parts.fragment))


TEST_URL = _url_for(TEST_DB)

os.environ["DAADNO_DATABASE_URL"] = TEST_URL
os.environ["DAADNO_PHONE_HMAC_KEY"] = "test-hmac-key"
os.environ["DAADNO_JWT_SECRET"] = "test-jwt-secret"
os.environ["DAADNO_ENVIRONMENT"] = "test"
os.environ["DAADNO_EMBEDDING_PROVIDER"] = "hashing"
os.environ["DAADNO_LLM_PROVIDER"] = "heuristic"


def _psql(url: str, sql: str) -> None:
    import psycopg

    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(sql)


@pytest.fixture(scope="session", autouse=True)
def database():
    try:
        _psql(ADMIN_URL, f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)')
        _psql(ADMIN_URL, f'CREATE DATABASE "{TEST_DB}"')
    except Exception as exc:  # pragma: no cover
        pytest.skip(f"Postgres در دسترس نیست: {exc}")

    for migration in ("001_schema.sql", "002_search.sql", "003_app.sql"):
        result = subprocess.run(
            ["psql", "-v", "ON_ERROR_STOP=1", "-q", TEST_URL, "-f", str(ROOT / "db" / migration)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:  # pragma: no cover
            pytest.fail(f"{migration} failed:\n{result.stderr}")

    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "load_seed.py"), "--reindex"],
        check=True,
        capture_output=True,
        env={**os.environ},
    )
    yield TEST_URL

    from daadno.db import close_pool

    close_pool()
    _psql(ADMIN_URL, f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)')


@pytest.fixture
def db(database):
    from daadno import db as db_module

    return db_module


@pytest.fixture
def approved_catalog(database):
    """کاتالوگ تأییدشده — برای تست‌هایی که باید چیزی برای سرو کردن باشد."""
    from daadno.db import connection
    from daadno.indexer import reindex_all

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE service SET status = 'approved', verified_at = now()," " verified_by = 'test'"
        )
        cur.execute("UPDATE faq SET status = 'approved'")
    reindex_all()
    yield
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE service SET status = 'needs_legal_review', verified_at = NULL,"
            " review_due_at = NULL"
        )
    reindex_all()


@pytest.fixture
def client(database):
    from fastapi.testclient import TestClient

    from daadno.app import create_app

    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture
def staff_tokens(database):
    from daadno.db import connection
    from daadno.security import (
        ROLE_ADMIN,
        ROLE_EDITOR,
        ROLE_LEGAL_REVIEWER,
        hash_password,
        issue_token,
    )

    people = {
        "admin": ("admin@test.local", [ROLE_ADMIN, ROLE_EDITOR]),
        "legal": ("legal@test.local", [ROLE_LEGAL_REVIEWER, ROLE_EDITOR]),
    }
    tokens = {}
    with connection() as conn, conn.cursor() as cur:
        for key, (email, roles) in people.items():
            cur.execute(
                "INSERT INTO staff_user (email, display_name, password_hash, roles)"
                " VALUES (%s, %s, %s, %s)"
                " ON CONFLICT (email) DO UPDATE SET roles = EXCLUDED.roles"
                " RETURNING id",
                (email, key, hash_password("pw"), roles),
            )
            tokens[key] = issue_token(str(cur.fetchone()["id"]), kind="staff", roles=roles)
    return tokens


@pytest.fixture
def user_token(database):
    from daadno.db import connection
    from daadno.security import hash_phone, issue_token

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (phone_hash) VALUES (%s)"
            " ON CONFLICT (phone_hash) DO UPDATE SET deleted_at = NULL RETURNING id",
            (hash_phone("09121234567"),),
        )
        user_id = str(cur.fetchone()["id"])
    return issue_token(user_id, kind="user"), user_id
