"""ماشین‌حساب هزینه و پیش‌نویس سند.
rules-ok-file(§1): این فایل پاک‌سازی فیلدهای اعتبارنامه را می‌آزماید.
"""

from __future__ import annotations

import pytest

from daadno import drafts, fees
from daadno.db import connection


def test_unapproved_fees_never_enter_the_total(db, approved_catalog):
    """§۲ — تعرفهٔ تأییدنشده در جمع نمی‌آید و دلیلش گفته می‌شود."""
    result = fees.estimate("sabt-shekvaiyeh")
    assert result["items"] == []
    assert result["total_rial"] == 0
    assert any(p["reason"] == "needs_legal_review" for p in result["pending_items"])
    assert "قطعی نیست" in result["disclaimer"]


def test_approved_fixed_fee_is_summed(db, approved_catalog):
    import json

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE fee SET status = 'approved', formula = %s" " WHERE label = 'هزینه شکواییه'",
            (json.dumps({"amount_rial": 500_000}),),
        )
    result = fees.estimate("sabt-shekvaiyeh")
    assert result["total_rial"] == 500_000
    assert result["items"][0]["amount_rial"] == 500_000


def test_percentage_fee_without_a_rate_stays_pending(db, approved_catalog):
    """نرخ null یعنی «کارشناس حقوقی هنوز پر نکرده» — حدس زده نمی‌شود."""
    with connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE fee SET status = 'approved' WHERE label = 'هزینه دادرسی مرحله بدوی'")
    result = fees.estimate("dadkhast-badvi", khaste_rial=1_000_000_000)
    assert result["items"] == []
    assert result["pending_items"][0]["reason"] == "incomplete_formula"


def test_percentage_fee_respects_min_and_max(db, approved_catalog):
    import json

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE fee SET status = 'approved', formula = %s"
            " WHERE label = 'هزینه دادرسی مرحله بدوی'",
            (json.dumps({"rate": 0.035, "min_rial": 200_000, "max_rial": 10_000_000}),),
        )
    small = fees.estimate("dadkhast-badvi", khaste_rial=1_000_000)
    large = fees.estimate("dadkhast-badvi", khaste_rial=10_000_000_000)
    assert small["total_rial"] == 200_000
    assert large["total_rial"] == 10_000_000


def test_unknown_service_raises(db, approved_catalog):
    with pytest.raises(fees.UnknownServiceError):
        fees.estimate("does-not-exist")


# --- پیش‌نویس ----------------------------------------------------------------


def test_render_requires_its_mandatory_fields():
    with pytest.raises(drafts.MissingFieldsError):
        drafts.render("shekvaiyeh", {"shaki": "الف"})


def test_render_includes_the_disclaimer():
    body = drafts.render(
        "shekvaiyeh",
        {"shaki": "الف", "moshtaki_anh": "ب", "mozoo": "کلاهبرداری", "sharh": "شرح"},
    )
    assert drafts.DISCLAIMER_DRAFT in body
    assert "# شکواییه" in body


def test_sanitize_drops_credential_like_fields():
    clean = drafts._sanitize({"sharh": "متن", "رمز_ثنا": "x", "password": "y"})
    assert clean == {"sharh": "متن"}


def test_every_template_has_a_service_to_cite():
    """§۴ — خروجی تولیدشده بدون ارجاع نمی‌ماند."""
    assert set(drafts.TEMPLATES) == set(drafts.TEMPLATE_SERVICE)
