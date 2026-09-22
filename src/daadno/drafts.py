"""تولید پیش‌نویس سند — ``POST /drafts``.

قالب‌ها ایستا و پرشدنی‌اند، نه تولیدشده توسط مدل: یک سند رسمی که مدل
آزادانه نوشته باشد، هم ریسک حقوقی است هم غیرقابل بازبینی. سلب مسئولیت
``DISCLAIMER_DRAFT`` از ``guards`` می‌آید و کد راهی برای حذف آن ندارد.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from .db import connection, fetch_one
from .guards import DISCLAIMER_DRAFT
from .jalali import format_jalali_long

TEMPLATES = {
    "shekvaiyeh": {
        "title": "شکواییه",
        "required": ["shaki", "moshtaki_anh", "mozoo", "sharh"],
        "labels": {
            "shaki": "شاکی",
            "moshtaki_anh": "مشتکی‌عنه",
            "mozoo": "موضوع شکایت",
            "sharh": "شرح ماوقع",
            "adele": "ادله و مستندات",
            "marja": "مرجع رسیدگی‌کننده",
        },
    },
    "dadkhast": {
        "title": "دادخواست",
        "required": ["khahan", "khande", "khaste", "sharh"],
        "labels": {
            "khahan": "خواهان",
            "khande": "خوانده",
            "khaste": "خواسته",
            "sharh": "شرح دادخواست",
            "adele": "دلایل و منضمات",
            "marja": "مرجع رسیدگی‌کننده",
        },
    },
    "layehe": {
        "title": "لایحه",
        "required": ["onvan", "shomare_parvande", "sharh"],
        "labels": {
            "onvan": "عنوان لایحه",
            "shomare_parvande": "شماره پرونده",
            "sharh": "متن لایحه",
            "marja": "مرجع رسیدگی‌کننده",
        },
    },
    "ezharnameh": {
        "title": "اظهارنامه",
        "required": ["ezhar_konande", "mokhatab", "mozoo", "sharh"],
        "labels": {
            "ezhar_konande": "اظهارکننده",
            "mokhatab": "مخاطب",
            "mozoo": "موضوع اظهارنامه",
            "sharh": "متن اظهار",
        },
    },
}

# قالب ← خدمتی که مستند فرایندی آن است. §۴ می‌گوید هر خروجی تولیدشده باید
# ارجاع داشته باشد؛ پیش‌نویس به کارت خدمتِ ثبت همان سند ارجاع می‌دهد.
TEMPLATE_SERVICE = {
    "shekvaiyeh": "sabt-shekvaiyeh",
    "dadkhast": "dadkhast-badvi",
    "layehe": "sabt-layehe",
    "ezharnameh": "sabt-ezharnameh",
}

# فیلدهایی که هرگز در پیش‌نویس ذخیره نمی‌شوند (§۱ و §۶).
# rules-ok(§1): فهرست سیاه است، نه ذخیره‌سازی
FORBIDDEN_FIELDS = {"password", "sana_password", "رمز", "رمز_ثنا", "otp"}


class UnknownTemplateError(LookupError):
    pass


class MissingFieldsError(ValueError):
    def __init__(self, missing: list[str]) -> None:
        super().__init__(", ".join(missing))
        self.missing = missing


class QuotaExceededError(RuntimeError):
    """سقف روزانه — ضد تولید انبوه شکایت."""


def _sanitize(fields: dict) -> dict:
    return {
        k: v
        for k, v in fields.items()
        if k.lower() not in FORBIDDEN_FIELDS and "رمز" not in k and "password" not in k.lower()
    }


def render(template_code: str, fields: dict) -> str:
    template = TEMPLATES.get(template_code)
    if template is None:
        raise UnknownTemplateError(template_code)

    missing = [f for f in template["required"] if not str(fields.get(f) or "").strip()]
    if missing:
        raise MissingFieldsError([template["labels"].get(m, m) for m in missing])

    today = format_jalali_long(date.today())
    lines = [
        f"# {template['title']}",
        "",
        f"تاریخ تنظیم: {today}",
        "",
    ]
    for key, label in template["labels"].items():
        value = str(fields.get(key) or "").strip()
        if not value:
            continue
        if key in {"sharh", "adele"}:
            lines += [f"## {label}", "", value, ""]
        else:
            lines.append(f"**{label}:** {value}")
    lines += ["", "---", "", DISCLAIMER_DRAFT]
    return "\n".join(lines)


def citations_for(template_code: str) -> list[dict]:
    slug = TEMPLATE_SERVICE.get(template_code)
    if not slug:
        return []
    rows = fetch_one("SELECT 1 FROM service_servable WHERE slug = %s", (slug,))
    if not rows:
        # خدمت هنوز تأیید حقوقی نگرفته: پیش‌نویس ارجاع ندارد و مسیر فراخوان
        # باید همین را به کاربر بگوید، نه این‌که ارجاع جعلی بسازد.
        return []
    return [{"service_slug": slug, "section": "summary"}]


def check_quota(user_id: str, daily_quota: int) -> None:
    row = fetch_one(
        "SELECT COUNT(*) AS n FROM draft_document"
        " WHERE user_id = %s AND created_at >= date_trunc('day', now())",
        (user_id,),
    )
    if (row or {}).get("n", 0) >= daily_quota:
        raise QuotaExceededError(str(daily_quota))


def create(
    user_id: str, template_code: str, fields: dict, case_id: str | None, daily_quota: int
) -> dict:
    check_quota(user_id, daily_quota)
    clean = _sanitize(fields)
    body = render(template_code, clean)

    import json

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO draft_document (user_id, case_id, template_code, fields, body_md)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, created_at
            """,
            (user_id, case_id, template_code, json.dumps(clean, ensure_ascii=False), body),
        )
        row = cur.fetchone()

    return {
        "id": str(row["id"]),
        "body_md": body,
        "disclaimer": DISCLAIMER_DRAFT,
        "citations": citations_for(template_code),
        "created_at": (row["created_at"] or datetime.now(UTC)).isoformat(),
    }
