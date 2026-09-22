"""نردبان یادآوری — T-205.

معیار پذیرش T-205 — rules-ok(§3): نقل معیار، نه عدد محصول.
«مهلت ۲۰ روزه → دقیقاً ۵ یادآور؛ اجرای دوباره ورکر پیام
تکراری نفرستد.» هر دو با ``UNIQUE (deadline_instance_id, fire_at, channel)``
در اسکیما و شرط ``sent_at IS NULL`` در ورکر تضمین می‌شوند.

متن پیامک عمداً هیچ محتوای حساسی ندارد: نه شماره پرونده، نه نوع ابلاغ.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from .db import connection, fetch_all
from .jalali import format_jalali

log = logging.getLogger(__name__)

# نردبان از seed/deadline_rules.json — همان ترتیب، همان کانال‌ها.
REMINDER_LADDER = (
    ("T-75%", "push"),
    ("T-50%", "push"),
    ("T-5d", "push"),
    ("T-2d", "sms"),
    ("T-0 09:00", "sms"),
)

SMS_TEXT = "دادنو: یکی از مهلت‌های ثبت‌شدهٔ شما نزدیک است. برای دیدن جزئیات وارد " "حساب خود شوید."
PUSH_TITLE = "مهلت نزدیک است"


@dataclass
class PlannedReminder:
    fire_at: datetime
    channel: str
    label: str


def _at(day: date, hour: int = 9) -> datetime:
    # Asia/Tehran = UTC+03:30؛ ساعت ۹ محلی یعنی ۰۵:۳۰ UTC.
    return datetime.combine(day, time(hour, 0), tzinfo=UTC) - timedelta(minutes=210)


def plan_ladder(computed_on: date, expires_on: date) -> list[PlannedReminder]:
    """نردبان را به زمان‌های مشخص تبدیل می‌کند. یادآور گذشته زمان‌بندی نمی‌شود."""
    total_days = (expires_on - computed_on).days
    planned: list[PlannedReminder] = []

    for label, channel in REMINDER_LADDER:
        if label.endswith("%"):
            fraction = int(label.split("-")[1].rstrip("%")) / 100
            day = computed_on + timedelta(days=round(total_days * (1 - fraction)))
        elif label == "T-0 09:00":
            day = expires_on
        else:
            offset = int(label.split("-")[1].rstrip("d"))
            day = expires_on - timedelta(days=offset)
        if day < computed_on or day > expires_on:
            continue
        planned.append(PlannedReminder(_at(day), channel, label))

    # دو یادآور در یک روز و یک کانال، ارزش افزوده ندارد.
    seen: set[tuple[datetime, str]] = set()
    unique: list[PlannedReminder] = []
    for item in sorted(planned, key=lambda p: p.fire_at):
        key = (item.fire_at, item.channel)
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def schedule_ladder(instance_id: str, *, computed_on: date | None = None) -> int:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT expires_on, computed_at FROM deadline_instance WHERE id = %s",
            (instance_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise LookupError(instance_id)
        start = computed_on or row["computed_at"].date()
        planned = plan_ladder(start, row["expires_on"])
        for item in planned:
            cur.execute(
                """
                INSERT INTO reminder (deadline_instance_id, fire_at, channel)
                VALUES (%s, %s, %s)
                ON CONFLICT (deadline_instance_id, fire_at, channel) DO NOTHING
                """,
                (instance_id, item.fire_at, item.channel),
            )
    return len(planned)


# ---------------------------------------------------------------------------
# ورکر
# ---------------------------------------------------------------------------


class Notifier:
    """درگاه ارسال. پیاده‌سازی واقعی (کاوه‌نگار/فایربیس) جای این را می‌گیرد."""

    def send(self, channel: str, recipient_hash: str, payload: dict) -> None:
        log.info(
            "notify %s to %s: %s",
            channel,
            recipient_hash[:8],
            json.dumps(payload, ensure_ascii=False),
        )


def run_worker(now: datetime | None = None, notifier: Notifier | None = None) -> dict:
    """یادآورهای سررسیده را می‌فرستد. اجرای دوباره پیام تکراری نمی‌فرستد."""
    now = now or datetime.now(UTC)
    notifier = notifier or Notifier()

    due = fetch_all(
        """
        SELECT r.id, r.channel, di.expires_on, di.user_notified_of_change,
               u.phone_hash
        FROM reminder r
        JOIN deadline_instance di ON di.id = r.deadline_instance_id
        JOIN eblagh_event e ON e.id = di.eblagh_event_id
        JOIN user_case c ON c.id = e.case_id
        JOIN app_user u ON u.id = c.user_id
        WHERE r.sent_at IS NULL
          AND r.fire_at <= %s
          AND di.superseded_by IS NULL
          AND u.deleted_at IS NULL
          AND NOT c.is_closed
        ORDER BY r.fire_at
        """,
        (now,),
    )

    sent = 0
    for item in due:
        # ادعای اتمی: فقط کسی که UPDATE‌اش رکورد را گرفت، می‌فرستد.
        with connection() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE reminder SET sent_at = %s WHERE id = %s AND sent_at IS NULL",
                (now, item["id"]),
            )
            claimed = cur.rowcount == 1
        if not claimed:
            continue
        payload = {
            "title": PUSH_TITLE,
            "body": SMS_TEXT,
            "expires_on_jalali": format_jalali(item["expires_on"]),
            "rule_changed": bool(item["user_notified_of_change"]),
        }
        if item["user_notified_of_change"]:
            payload["body"] = "دادنو: عدد مهلت شما تغییر کرد. لطفاً تاریخ جدید را ببینید."
        notifier.send(item["channel"], item["phone_hash"], payload)
        sent += 1

    return {"due": len(due), "sent": sent}
