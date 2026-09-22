"""نرمال‌سازی و جست‌وجو — قواعد ۷ و ۸."""

from __future__ import annotations

import pytest

from daadno.db import fetch_all, fetch_one, normalize_fa


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("سلام كيف", "سلام کیف"),  # کاف و یای عربی
        ("١٢٣", "123"),  # ارقام عربی
        ("۱۲۳", "123"),  # ارقام فارسی
        ("نيم‌فاصله", "نیم فاصله"),  # ZWNJ → فاصله
        ("  دو   فاصله  ", "دو فاصله"),  # فشرده‌سازی فاصله
        ("مُحَمَّد", "محمد"),  # حذف حرکات
    ],
)
def test_normalize_fa(db, raw, expected):
    """معیار پذیرش T-001."""
    assert normalize_fa(raw) == expected


def test_normalisation_is_idempotent(db):
    once = normalize_fa("كيفري ١٤٠٥")
    assert normalize_fa(once) == once


def test_vakhahi_and_tajdidnazar_do_not_collapse(db):
    """§۸ — درهم‌ریختن این دو اصطلاح خطای مرگبار دامنه است."""
    a = fetch_one("SELECT to_tsvector('fa', normalize_fa('واخواهی')) AS v")["v"]
    b = fetch_one("SELECT to_tsvector('fa', normalize_fa('تجدیدنظرخواهی')) AS v")["v"]
    assert a != b
    row = fetch_one(
        "SELECT to_tsvector('fa', normalize_fa('واخواهی'))"
        " @@ plainto_tsquery('fa', normalize_fa('تجدیدنظرخواهی')) AS m"
    )
    assert row["m"] is False


def test_search_config_has_no_stemmer(db):
    """§۸ — پیکربندی باید کپی simple بماند."""
    rows = fetch_all(
        "SELECT d.dictname FROM pg_ts_config c"
        " JOIN pg_ts_config_map m ON m.mapcfg = c.oid"
        " JOIN pg_ts_dict d ON d.oid = m.mapdict"
        " WHERE c.cfgname = 'fa'"
    )
    assert rows
    # هر دیکشنری غیر از simple یعنی استمر وارد شده است.
    assert all(r["dictname"] == "simple" for r in rows)


def test_hybrid_search_with_empty_arguments_does_not_error(db):
    """معیار پذیرش T-001، بند دوم."""
    zero = "[" + ",".join(["0"] * 1024) + "]"
    rows = fetch_all("SELECT * FROM hybrid_search('', %s::vector, 5)", (zero,))
    assert isinstance(rows, list)


def test_hybrid_search_only_returns_approved_services(db, approved_catalog):
    from daadno import retrieval
    from daadno.db import connection

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE service SET status = 'needs_legal_review' WHERE slug = 'eblagh-electronic'"
        )
    chunks = retrieval.retrieve("ابلاغیه الکترونیک پیامک")
    assert all(c.service_slug != "eblagh-electronic" for c in chunks)
