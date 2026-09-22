"""خروجی ICS — T-206.

رویداد تمام‌روز با ``VALUE=DATE``؛ هم Google Calendar و هم تقویم iOS همین
شکل را بدون خطا باز می‌کنند. متن سلب مسئولیت داخل DESCRIPTION می‌رود تا از
فایل جدا نشود.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from .guards import DISCLAIMER_DEADLINE
from .jalali import format_jalali

_LINE_LIMIT = 75


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> list[str]:
    """RFC 5545 §3.1 — تا کردن روی بایت، نه کاراکتر؛ فارسی چندبایتی است."""
    raw = line.encode("utf-8")
    if len(raw) <= _LINE_LIMIT:
        return [line]
    out, cursor = [], 0
    limit = _LINE_LIMIT
    while cursor < len(raw):
        end = min(cursor + limit, len(raw))
        # اگر برش وسط یک دنبالهٔ چندبایتی افتاده، عقب می‌رویم تا به ابتدای
        # همان دنباله برسیم — بایت ادامه با 10xxxxxx شروع می‌شود.
        while end < len(raw) and end > cursor and (raw[end] & 0xC0) == 0x80:
            end -= 1
        chunk = raw[cursor:end].decode("utf-8")
        out.append(chunk if cursor == 0 else " " + chunk)
        cursor = end
        limit = _LINE_LIMIT - 1
    return out


def build_calendar(case_label: str, deadlines: list[dict], *, uid_domain: str = "daadno.ir") -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Daadno//Judicial Services Navigator//FA",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape(f'مهلت‌های پرونده {case_label}')}",
    ]

    for item in deadlines:
        start = date.fromisoformat(item["expires_on"])
        legal = item.get("legal_ref") or {}
        description = (
            f"مهلت: {item['title_fa']}\n"
            f"تاریخ جلالی: {format_jalali(start)}\n"
            + (f"مستند: {legal.get('law_title')} {legal.get('article')}\n" if legal else "")
            + DISCLAIMER_DEADLINE
        )
        lines += [
            "BEGIN:VEVENT",
            f"UID:{item['id']}@{uid_domain}",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{start.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{(start + timedelta(days=1)).strftime('%Y%m%d')}",
            "SUMMARY:" + _escape("آخرین روز مهلت — " + item["title_fa"]),
            f"DESCRIPTION:{_escape(description)}",
            "TRANSP:TRANSPARENT",
            "BEGIN:VALARM",
            "TRIGGER:-P2D",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_escape('مهلت شما تا دو روز دیگر است')}",
            "END:VALARM",
            "END:VEVENT",
        ]

    lines.append("END:VCALENDAR")

    folded: list[str] = []
    for line in lines:
        folded += _fold(line)
    return "\r\n".join(folded) + "\r\n"
