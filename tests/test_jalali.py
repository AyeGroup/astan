"""تقویم جلالی — T-201.

«تست روی سال کبیسه و مرز فروردین.»
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from daadno import jalali


def test_known_conversions():
    assert jalali.jalali_to_gregorian(1405, 1, 1) == date(2026, 3, 21)
    assert jalali.gregorian_to_jalali(date(2026, 3, 21)) == (1405, 1, 1)
    assert jalali.format_jalali(date(2026, 9, 22)) == "1405/06/31"


def test_leap_year_has_esfand_30():
    assert jalali.is_leap_jalali(1403)
    assert jalali.days_in_jalali_month(1403, 12) == 30
    assert jalali.jalali_to_gregorian(1403, 12, 30) == date(2025, 3, 20)


def test_non_leap_year_rejects_esfand_30():
    assert not jalali.is_leap_jalali(1405)
    assert jalali.days_in_jalali_month(1405, 12) == 29
    with pytest.raises(ValueError):
        jalali.jalali_to_gregorian(1405, 12, 30)


def test_farvardin_boundary():
    """آخرین روز اسفند و اولین روز فروردین، پشت سر هم."""
    last_of_year = jalali.jalali_to_gregorian(1403, 12, 30)
    first_of_next = jalali.jalali_to_gregorian(1404, 1, 1)
    assert first_of_next - last_of_year == timedelta(days=1)
    assert jalali.gregorian_to_jalali(last_of_year) == (1403, 12, 30)
    assert jalali.gregorian_to_jalali(first_of_next) == (1404, 1, 1)


def test_round_trip_over_forty_years():
    day = date(1990, 1, 1)
    while day < date(2035, 1, 1):
        jy, jm, jd = jalali.gregorian_to_jalali(day)
        assert jalali.jalali_to_gregorian(jy, jm, jd) == day
        day += timedelta(days=1)


def test_add_months_clamps_to_month_length():
    """۳۱ شهریور + ۱ ماه باید به ۳۰ مهر برود، نه به روزی که وجود ندارد."""
    start = jalali.jalali_to_gregorian(1405, 6, 31)
    result = jalali.add_jalali_months(start, 1)
    assert jalali.gregorian_to_jalali(result) == (1405, 7, 30)


def test_add_months_across_new_year():
    start = jalali.jalali_to_gregorian(1404, 12, 1)
    assert jalali.gregorian_to_jalali(jalali.add_jalali_months(start, 2)) == (1405, 2, 1)
