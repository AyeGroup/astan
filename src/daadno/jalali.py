"""تبدیل تقویم جلالی ↔ میلادی — T-201.

الگوریتم حسابی ۳۳ ساله (بیرشک). بدون وابستگی خارجی تا در CI بدون شبکه
اجرا شود. مرزهای فروردین و سال کبیسه در ``tests/test_jalali.py`` تست شده‌اند.
"""

from __future__ import annotations

from datetime import date, timedelta

_BREAKS = (
    -61,
    9,
    38,
    199,
    426,
    686,
    756,
    818,
    1111,
    1181,
    1210,
    1635,
    2060,
    2097,
    2192,
    2262,
    2324,
    2394,
    2456,
    3178,
)

_FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
MONTH_NAMES_FA = (
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
)


def _jal_cal(jy: int) -> tuple[int, int, int]:
    """(leap, gy, march) — پیاده‌سازی مرجع jalaali-js."""
    bl = len(_BREAKS)
    gy = jy + 621
    leap_j = -14
    jp = _BREAKS[0]
    if jy < jp or jy >= _BREAKS[bl - 1]:
        raise ValueError(f"jalali year {jy} out of range")

    jump = 0
    for i in range(1, bl):
        jm = _BREAKS[i]
        jump = jm - jp
        if jy < jm:
            break
        leap_j += jump // 33 * 8 + (jump % 33) // 4
        jp = jm

    n = jy - jp
    leap_j += n // 33 * 8 + ((n % 33) + 3) // 4
    if jump % 33 == 4 and jump - n == 4:
        leap_j += 1

    leap_g = (gy // 4) - ((gy // 100 + 1) * 3 // 4) - 150
    march = 20 + leap_j - leap_g

    if jump - n < 6:
        n = n - jump + (jump + 4) // 33 * 33
    leap = ((n + 1) % 33 - 1) % 4
    if leap == -1:
        leap = 4
    return leap, gy, march


def is_leap_jalali(jy: int) -> bool:
    return _jal_cal(jy)[0] == 0


def days_in_jalali_month(jy: int, jm: int) -> int:
    if jm <= 6:
        return 31
    if jm <= 11:
        return 30
    return 30 if is_leap_jalali(jy) else 29


def jalali_to_gregorian(jy: int, jm: int, jd: int) -> date:
    if not 1 <= jm <= 12:
        raise ValueError("jalali month out of range")
    if not 1 <= jd <= days_in_jalali_month(jy, jm):
        raise ValueError(f"day {jd} does not exist in {jy}/{jm}")
    _, gy, march = _jal_cal(jy)
    offset = (jm - 1) * 31 if jm <= 6 else (6 * 31 + (jm - 7) * 30)
    return date(gy, 3, 1) + timedelta(days=march - 1 + offset + jd - 1)


def gregorian_to_jalali(g: date) -> tuple[int, int, int]:
    jy = g.year - 621
    # نوروز همان سال ممکن است هنوز نرسیده باشد.
    try:
        nowruz = jalali_to_gregorian(jy, 1, 1)
    except ValueError:
        nowruz = None
    if nowruz is None or g < nowruz:
        jy -= 1
        nowruz = jalali_to_gregorian(jy, 1, 1)

    day_of_year = (g - nowruz).days
    if day_of_year < 186:
        jm = day_of_year // 31 + 1
        jd = day_of_year % 31 + 1
    else:
        rest = day_of_year - 186
        jm = 7 + rest // 30
        jd = rest % 30 + 1
    return jy, jm, jd


def format_jalali(g: date, *, persian_digits: bool = False) -> str:
    jy, jm, jd = gregorian_to_jalali(g)
    text = f"{jy:04d}/{jm:02d}/{jd:02d}"
    return text.translate(_FA_DIGITS) if persian_digits else text


def format_jalali_long(g: date) -> str:
    jy, jm, jd = gregorian_to_jalali(g)
    return f"{jd} {MONTH_NAMES_FA[jm - 1]} {jy}"


def add_jalali_months(g: date, months: int) -> date:
    """«یک ماه» در این دامنه یعنی یک ماه جلالی، نه ۳۰ روز."""
    jy, jm, jd = gregorian_to_jalali(g)
    total = (jy * 12 + (jm - 1)) + months
    ny, nm = divmod(total, 12)
    nm += 1
    nd = min(jd, days_in_jalali_month(ny, nm))
    return jalali_to_gregorian(ny, nm, nd)
