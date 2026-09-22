"""موتور مواعد — T-202 و T-203.

ENGINEERING_RULES.md §۳: هیچ عددی اینجا نیست. موتور فقط قواعدی را محاسبه
می‌کند که ``status = 'approved'`` دارند؛ بقیه در ``unavailable_rules``
برمی‌گردند تا کاربر بداند عدد نداریم، نه این‌که عدد اشتباه ببیند.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta

from . import jalali
from .db import connection, fetch_all
from .guards import DISCLAIMER_DEADLINE


@dataclass
class ComputedDeadline:
    rule_code: str
    title_fa: str
    expires_on: date
    rule_snapshot: dict


class RuleNotApprovedError(RuntimeError):
    """قاعدهٔ تأییدنشده هرگز محاسبه نمی‌شود."""


# ---------------------------------------------------------------------------
# تعطیلات
# ---------------------------------------------------------------------------


def load_holidays(start: date, end: date) -> set[date]:
    rows = fetch_all(
        "SELECT d FROM holiday WHERE d BETWEEN %s AND %s", (start, end + timedelta(days=400))
    )
    return {r["d"] for r in rows}


def is_holiday(day: date, holidays: set[date]) -> bool:
    # جمعه = weekday 4 در پایتون. تعطیلی رسمی هفتگی ایران.
    return day.weekday() == 4 or day in holidays


def holiday_table_is_empty() -> bool:
    """تا پر شدن جدول، ``extend_if_ends_on_holiday`` عملاً فقط جمعه‌ها را می‌بیند."""
    rows = fetch_all("SELECT 1 FROM holiday LIMIT 1")
    return not rows


# ---------------------------------------------------------------------------
# محاسبه
# ---------------------------------------------------------------------------


def compute_expiry(rule: dict, seen_at: date, holidays: set[date] | None = None) -> date:
    """تاریخ انقضای یک مهلت از روی قاعده و تاریخ رؤیت.

    قاعده باید تأییدشده و دارای ``duration_value`` باشد — هر دو در دیتابیس با
    ``CHECK rule_approved_is_complete`` تضمین شده‌اند، ولی موتور هم دوباره
    بررسی می‌کند چون اینجا آخرین نقطهٔ قبل از دیدن کاربر است.
    """
    if rule.get("status") != "approved":
        raise RuleNotApprovedError(rule.get("code"))
    duration = rule.get("duration_value")
    if duration is None:
        raise RuleNotApprovedError(rule.get("code"))

    holidays = holidays if holidays is not None else load_holidays(seen_at, seen_at)

    start = seen_at if rule.get("count_from") == "day_of_eblagh" else seen_at + timedelta(days=1)

    if rule.get("duration_unit") == "month":
        # ماه جلالی، نه ۳۰ روز. مرز اسفند و فروردین همین‌جا اهمیت پیدا می‌کند.
        end = jalali.add_jalali_months(start, int(duration)) - timedelta(days=1)
        if rule.get("skip_holidays"):
            end = _skip_holidays_forward(start, end, holidays)
    elif rule.get("skip_holidays"):
        # «فقط روزهای کاری»: تعطیلات شمرده نمی‌شوند.
        end = start - timedelta(days=1)
        counted = 0
        while counted < int(duration):
            end += timedelta(days=1)
            if not is_holiday(end, holidays):
                counted += 1
    else:
        end = start + timedelta(days=int(duration) - 1)

    if rule.get("extend_if_ends_on_holiday", True):
        # «اگر آخرین روز تعطیل بود، به اولین روز کاری بعد می‌افتد.»
        while is_holiday(end, holidays):
            end += timedelta(days=1)

    return end


def _skip_holidays_forward(start: date, end: date, holidays: set[date]) -> date:
    """برای واحد ماه: به ازای هر تعطیلی داخل بازه، یک روز به انتها اضافه می‌شود."""
    cursor, extra = start, 0
    while cursor <= end:
        if is_holiday(cursor, holidays):
            extra += 1
        cursor += timedelta(days=1)
    for _ in range(extra):
        end += timedelta(days=1)
        while is_holiday(end, holidays):
            end += timedelta(days=1)
    return end


def rules_for_eblagh(eblagh_type_code: str, residency: str) -> tuple[list[dict], list[dict]]:
    """(قواعد تأییدشده، قواعد بدون تأیید) برای یک نوع ابلاغ."""
    rows = fetch_all(
        """
        SELECT r.id, r.code, r.title_fa, r.duration_value, r.duration_unit,
               r.residency::text, r.count_from::text, r.skip_holidays,
               r.extend_if_ends_on_holiday, r.as_of_year, r.status::text,
               r.approved_by, r.approved_at,
               lr.law_title, lr.article, lr.url
        FROM deadline_rule r
        JOIN eblagh_type t ON t.id = r.trigger_type_id
        LEFT JOIN legal_ref lr ON lr.id = r.legal_ref_id
        WHERE t.code = %s AND r.residency::text IN (%s, 'any')
        ORDER BY r.code
        """,
        (eblagh_type_code, residency),
    )
    approved = [r for r in rows if r["status"] == "approved" and r["duration_value"] is not None]
    unavailable = [
        {"code": r["code"], "title_fa": r["title_fa"], "reason": "needs_legal_review"}
        for r in rows
        if r["status"] != "approved" or r["duration_value"] is None
    ]
    return approved, unavailable


def compute_for_event(event_id: str) -> dict:
    """محاسبه و ذخیرهٔ ``deadline_instance`` برای یک رویداد ابلاغ."""
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT e.id, e.seen_at, e.residency::text, t.code AS eblagh_code
            FROM eblagh_event e
            JOIN eblagh_type t ON t.id = e.eblagh_type_id
            WHERE e.id = %s
            """,
            (event_id,),
        )
        event = cur.fetchone()
    if event is None:
        raise LookupError(event_id)

    approved, unavailable = rules_for_eblagh(event["eblagh_code"], event["residency"])
    holidays = load_holidays(event["seen_at"], event["seen_at"])

    created = []
    for rule in approved:
        expires = compute_expiry(rule, event["seen_at"], holidays)
        snapshot = _snapshot(rule)
        with connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO deadline_instance
                  (eblagh_event_id, rule_id, rule_snapshot, expires_on)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (event_id, rule["id"], json.dumps(snapshot, ensure_ascii=False), expires),
            )
            created.append(str(cur.fetchone()["id"]))

    return {"instance_ids": created, "unavailable_rules": unavailable}


def _snapshot(rule: dict) -> dict:
    """قاعده در لحظهٔ محاسبه فریز می‌شود تا بعداً بتوان گفت «عدد قبلی چه بود»."""
    return {
        "code": rule["code"],
        "title_fa": rule["title_fa"],
        "duration_value": rule["duration_value"],
        "duration_unit": rule["duration_unit"],
        "residency": rule["residency"],
        "count_from": rule["count_from"],
        "skip_holidays": rule["skip_holidays"],
        "extend_if_ends_on_holiday": rule["extend_if_ends_on_holiday"],
        "as_of_year": rule["as_of_year"],
        "approved_by": rule.get("approved_by"),
        "approved_at": rule["approved_at"].isoformat() if rule.get("approved_at") else None,
        "legal_ref": _legal_ref(rule),
    }


def _legal_ref(rule: dict) -> dict | None:
    if not rule.get("law_title"):
        return None
    return {
        "law_title": rule["law_title"],
        "article": rule.get("article"),
        "url": rule.get("url"),
    }


def list_for_case(case_id: str, *, today: date | None = None) -> list[dict]:
    today = today or date.today()
    rows = fetch_all(
        """
        SELECT di.id, di.expires_on, di.rule_snapshot, di.computed_at,
               di.user_notified_of_change, di.superseded_by,
               r.code AS rule_code, r.title_fa
        FROM deadline_instance di
        JOIN eblagh_event e ON e.id = di.eblagh_event_id
        JOIN deadline_rule r ON r.id = di.rule_id
        WHERE e.case_id = %s AND di.superseded_by IS NULL
        ORDER BY di.expires_on
        """,
        (case_id,),
    )
    return [_present(r, today) for r in rows]


def _present(row: dict, today: date) -> dict:
    snapshot = row["rule_snapshot"] or {}
    return {
        "id": str(row["id"]),
        "rule_code": row["rule_code"],
        "title_fa": row["title_fa"],
        "expires_on": row["expires_on"].isoformat(),
        "expires_on_jalali": jalali.format_jalali(row["expires_on"]),
        "days_left": (row["expires_on"] - today).days,
        "legal_ref": snapshot.get("legal_ref"),
        "recomputed": bool(row.get("user_notified_of_change")) or _was_recomputed(row),
        "disclaimer": DISCLAIMER_DEADLINE,
    }


def _was_recomputed(row: dict) -> bool:
    return row.get("computed_at") is not None and row.get("superseded_by") is not None


# ---------------------------------------------------------------------------
# T-203 — بازمحاسبه پس از اصلاح قاعده
# ---------------------------------------------------------------------------


def recompute_rule(rule_id: int) -> dict:
    """نمونه‌های فعال یک قاعده را بازمحاسبه می‌کند.

    نمونهٔ قبلی حذف نمی‌شود: ``superseded_by`` به نمونهٔ جدید اشاره می‌کند تا
    تاریخچه بماند، و اگر عدد عوض شده باشد نمونهٔ جدید
    ``user_notified_of_change = TRUE`` می‌گیرد تا ورکر یادآور، کاربر را خبر کند.
    """
    rows = fetch_all(
        """
        SELECT r.id, r.code, r.title_fa, r.duration_value, r.duration_unit,
               r.residency::text, r.count_from::text, r.skip_holidays,
               r.extend_if_ends_on_holiday, r.as_of_year, r.status::text,
               r.approved_by, r.approved_at, lr.law_title, lr.article, lr.url
        FROM deadline_rule r
        LEFT JOIN legal_ref lr ON lr.id = r.legal_ref_id
        WHERE r.id = %s
        """,
        (rule_id,),
    )
    if not rows:
        raise LookupError(rule_id)
    rule = rows[0]
    if rule["status"] != "approved" or rule["duration_value"] is None:
        raise RuleNotApprovedError(rule["code"])

    instances = fetch_all(
        """
        SELECT di.id, di.expires_on, di.eblagh_event_id, e.seen_at
        FROM deadline_instance di
        JOIN eblagh_event e ON e.id = di.eblagh_event_id
        WHERE di.rule_id = %s AND di.superseded_by IS NULL
        """,
        (rule_id,),
    )

    snapshot = _snapshot(rule)
    changed = unchanged = 0

    for instance in instances:
        new_expiry = compute_expiry(
            rule, instance["seen_at"], load_holidays(instance["seen_at"], instance["seen_at"])
        )
        if new_expiry == instance["expires_on"]:
            unchanged += 1
            continue
        with connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO deadline_instance
                  (eblagh_event_id, rule_id, rule_snapshot, expires_on,
                   user_notified_of_change)
                VALUES (%s, %s, %s, %s, TRUE)
                RETURNING id
                """,
                (
                    instance["eblagh_event_id"],
                    rule_id,
                    json.dumps(snapshot, ensure_ascii=False),
                    new_expiry,
                ),
            )
            new_id = cur.fetchone()["id"]
            cur.execute(
                "UPDATE deadline_instance SET superseded_by = %s WHERE id = %s",
                (new_id, instance["id"]),
            )
            # یادآورهای نفرستادهٔ نمونهٔ قدیمی بی‌اعتبارند.
            cur.execute(
                "DELETE FROM reminder WHERE deadline_instance_id = %s AND sent_at IS NULL",
                (instance["id"],),
            )
        from .reminders import schedule_ladder

        schedule_ladder(str(new_id))
        changed += 1

    return {"rule_code": rule["code"], "recomputed": changed, "unchanged": unchanged}
