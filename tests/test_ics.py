"""خروجی ICS — T-206."""

from __future__ import annotations

from daadno import ics
from daadno.guards import DISCLAIMER_DEADLINE

DEADLINE = {
    "id": "11111111-1111-1111-1111-111111111111",
    "rule_code": "vakhahi",
    "title_fa": "مهلت واخواهی از حکم غیابی",
    "expires_on": "2026-05-24",
    "days_left": 12,
    "legal_ref": {"law_title": "قانون آیین دادرسی مدنی", "article": "ماده ۳۰۶"},
    "disclaimer": DISCLAIMER_DEADLINE,
}


def _calendar() -> str:
    return ics.build_calendar("پروندهٔ چک", [DEADLINE])


def test_structure_is_well_formed():
    body = _calendar()
    assert body.startswith("BEGIN:VCALENDAR\r\n")
    assert body.rstrip().endswith("END:VCALENDAR")
    assert body.count("BEGIN:VEVENT") == body.count("END:VEVENT") == 1
    assert "VERSION:2.0" in body


def test_all_day_event_uses_date_value():
    body = _calendar()
    assert "DTSTART;VALUE=DATE:20260524" in body
    assert "DTEND;VALUE=DATE:20260525" in body


def test_disclaimer_travels_with_the_file():
    """§۵ — سلب مسئولیت از محاسبه جدا نمی‌شود، حتی وقتی فایل جای دیگری باز شود."""
    body = _calendar().replace("\r\n ", "")
    assert "مشاوره حقوقی نیست" in body


def test_lines_are_folded_on_byte_boundaries():
    """فارسی چندبایتی است؛ تا کردن اشتباه فایل را در تقویم iOS خراب می‌کند."""
    for line in _calendar().split("\r\n"):
        assert len(line.encode("utf-8")) <= 75, line[:40]


def test_special_characters_are_escaped():
    item = {**DEADLINE, "title_fa": "مهلت الف, ب; ج"}
    body = ics.build_calendar("تست", [item]).replace("\r\n ", "")
    assert "الف\\, ب\; ج" in body


def test_empty_case_still_produces_a_valid_calendar():
    body = ics.build_calendar("بدون مهلت", [])
    assert "BEGIN:VCALENDAR" in body and "BEGIN:VEVENT" not in body
