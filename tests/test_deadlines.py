"""موتور مواعد — T-202 و T-203."""

from __future__ import annotations

from datetime import date

import pytest

from daadno import deadlines
from daadno.db import connection


def _rule(**overrides) -> dict:
    """قاعدهٔ تأییدشدهٔ ساختگی برای تست موتور.

    عدد اینجا دادهٔ تست است، نه محتوای محصول: هیچ مسیری از این dict به
    دیتابیس یا به کاربر نمی‌رود.
    """
    base = {
        "code": "test_rule",
        "title_fa": "قاعدهٔ تست",
        "duration_value": 20,
        "duration_unit": "day",
        "residency": "inside_iran",
        "count_from": "day_after_eblagh",
        "skip_holidays": False,
        "extend_if_ends_on_holiday": False,
        "as_of_year": 1405,
        "status": "approved",
        "approved_by": "test",
        "approved_at": None,
        "law_title": None,
        "article": None,
        "url": None,
    }
    base.update(overrides)
    return base


def test_unapproved_rule_is_never_computed():
    """§۳ — قاعده‌ای که تأیید نشده، عدد نمی‌دهد."""
    with pytest.raises(deadlines.RuleNotApprovedError):
        deadlines.compute_expiry(_rule(status="needs_legal_review"), date(2026, 5, 3), set())


def test_approved_rule_without_number_is_never_computed():
    with pytest.raises(deadlines.RuleNotApprovedError):
        deadlines.compute_expiry(_rule(duration_value=None), date(2026, 5, 3), set())


def test_count_from_day_after_eblagh():
    """شمارش از روز بعد: روز رؤیت جزو مهلت نیست."""
    expiry = deadlines.compute_expiry(_rule(duration_value=10), date(2026, 5, 3), set())
    assert expiry == date(2026, 5, 13)


def test_count_from_day_of_eblagh():
    expiry = deadlines.compute_expiry(
        _rule(duration_value=10, count_from="day_of_eblagh"), date(2026, 5, 3), set()
    )
    assert expiry == date(2026, 5, 12)


def test_extend_if_ends_on_holiday_moves_to_next_working_day():
    # ۲۰۲۶-۰۵-۰۸ جمعه است.
    rule = _rule(duration_value=5, extend_if_ends_on_holiday=True)
    assert deadlines.compute_expiry(rule, date(2026, 5, 3), set()) == date(2026, 5, 9)
    assert deadlines.compute_expiry(
        _rule(duration_value=5, extend_if_ends_on_holiday=False), date(2026, 5, 3), set()
    ) == date(2026, 5, 8)


def test_extend_skips_a_declared_holiday_too():
    holidays = {date(2026, 5, 9), date(2026, 5, 10)}
    rule = _rule(duration_value=5, extend_if_ends_on_holiday=True)
    assert deadlines.compute_expiry(rule, date(2026, 5, 3), holidays) == date(2026, 5, 11)


def test_skip_holidays_counts_working_days_only():
    rule = _rule(duration_value=5, skip_holidays=True)
    # شروع ۲۰۲۶-۰۵-۰۴؛ ۲۰۲۶-۰۵-۰۸ جمعه است و شمرده نمی‌شود.
    assert deadlines.compute_expiry(rule, date(2026, 5, 3), set()) == date(2026, 5, 9)


def test_month_unit_uses_jalali_months_not_thirty_days():
    """«یک ماه» در این دامنه ماه جلالی است، نه ۳۰ روز."""
    rule = _rule(duration_value=2, duration_unit="month")
    # ۱۴۰۵/۰۱/۰۲ = ۲۰۲۶-۰۳-۲۲ → دو ماه جلالی (۳۱+۳۱ روز)
    expiry = deadlines.compute_expiry(rule, date(2026, 3, 21), set())
    assert expiry == date(2026, 5, 22)


def test_outside_iran_rules_are_selected_by_residency(db):
    approved, unavailable = deadlines.rules_for_eblagh("raye_badvi", "outside_iran")
    codes = {r["code"] for r in unavailable}
    assert "tajdidnazar_hoquqi_kharej" in codes
    # قاعدهٔ داخل کشور نباید برای مقیم خارج انتخاب شود.
    assert "tajdidnazar_hoquqi" not in codes


def test_seed_rules_are_all_unavailable(db):
    """همهٔ قواعد seed بدون عددند و باید در unavailable_rules بیایند."""
    approved, unavailable = deadlines.rules_for_eblagh("raye_badvi", "inside_iran")
    assert approved == []
    assert unavailable
    assert all(u["reason"] == "needs_legal_review" for u in unavailable)


def test_database_blocks_approving_an_incomplete_rule(db):
    """دروازهٔ CHECK rule_approved_is_complete."""
    from psycopg.errors import CheckViolation

    with pytest.raises(CheckViolation):
        with connection() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE deadline_rule SET status = 'approved', approved_by = 'x'"
                " WHERE code = 'vakhahi'"
            )
