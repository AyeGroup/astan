#!/usr/bin/env python3
"""دادهٔ توسعه: کاربران کارمند و یک مسیر پایان‌به‌پایان قابل اجرا.

این اسکریپت فقط برای محیط توسعه است. کاری که می‌کند:
  ۱. سه کارمند با نقش‌های متفاوت می‌سازد (admin بدون اختیار تأیید حقوقی،
     تا معیار پذیرش T-004 قابل تست باشد).
  ۲. تعطیلات رسمی نمونه را وارد می‌کند تا ``extend_if_ends_on_holiday``
     بی‌اثر نماند.
  ۳. چند مرجع قضایی نمونه برای ``/courts/search``.

عمداً هیچ ``duration_value``ی پر نمی‌کند و هیچ خدمتی را approve نمی‌کند؛
آن دو کار مالک انسانی دارند. برای دموی محلی از ``--approve-catalog`` و
``--approve-rule`` استفاده کنید که صراحتاً می‌گویند دارند چه چیزی را جعل
می‌کنند.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from daadno.db import connection  # noqa: E402
from daadno.security import (  # noqa: E402
    ROLE_ADMIN,
    ROLE_EDITOR,
    ROLE_LEGAL_REVIEWER,
    hash_password,
)

STAFF = [
    ("admin@daadno.local", "مدیر سامانه", [ROLE_ADMIN, ROLE_EDITOR]),
    ("legal@daadno.local", "کارشناس حقوقی", [ROLE_LEGAL_REVIEWER, ROLE_EDITOR]),
    ("editor@daadno.local", "سردبیر محتوا", [ROLE_EDITOR]),
]
DEV_PASSWORD = "daadno-dev"

# نمونهٔ تعطیلات رسمی. منبع واقعی باید جایگزین شود (T-201).
SAMPLE_HOLIDAYS = [
    (date(2026, 3, 21), "نوروز"),
    (date(2026, 3, 22), "نوروز"),
    (date(2026, 3, 23), "نوروز"),
    (date(2026, 3, 24), "نوروز"),
    (date(2026, 4, 1), "روز طبیعت"),
]

SAMPLE_COURTS = [
    ("دادگستری کل استان تهران", "dadgostari", "تهران", "تهران"),
    ("مجتمع قضایی شهید بهشتی", "dadgostari", "تهران", "تهران"),
    ("دیوان عدالت اداری", "divan", "تهران", "تهران"),
    ("دادسرای عمومی و انقلاب مشهد", "dadsara", "خراسان رضوی", "مشهد"),
    ("شورای حل اختلاف شیراز", "shora", "فارس", "شیراز"),
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--approve-catalog", action="store_true", help="[فقط دمو] همهٔ خدمات را approved کن"
    )
    parser.add_argument(
        "--approve-rule", default=None, help="[فقط دمو] کد قاعده‌ای که با عدد ساختگی approve شود"
    )
    parser.add_argument(
        "--approve-rule-days", type=int, default=None, help="[فقط دمو] عدد ساختگی برای همان قاعده"
    )
    args = parser.parse_args()

    with connection() as conn, conn.cursor() as cur:
        for email, name, roles in STAFF:
            cur.execute(
                "INSERT INTO staff_user (email, display_name, password_hash, roles)"
                " VALUES (%s, %s, %s, %s)"
                " ON CONFLICT (email) DO UPDATE SET roles = EXCLUDED.roles,"
                " display_name = EXCLUDED.display_name",
                (email, name, hash_password(DEV_PASSWORD), roles),
            )
        for day, title in SAMPLE_HOLIDAYS:
            cur.execute(
                "INSERT INTO holiday (d, title_fa, source) VALUES (%s, %s, 'dev-sample')"
                " ON CONFLICT (d) DO NOTHING",
                (day, title),
            )
        for name, kind, province, city in SAMPLE_COURTS:
            cur.execute(
                "INSERT INTO court (name_fa, kind, province, city)"
                " VALUES (%s, %s, %s, %s) ON CONFLICT (name_fa, city) DO NOTHING",
                (name, kind, province, city),
            )

    print(f"کارمندان: {len(STAFF)} (رمز توسعه: {DEV_PASSWORD})")
    print(f"تعطیلات نمونه: {len(SAMPLE_HOLIDAYS)} | مراجع نمونه: {len(SAMPLE_COURTS)}")

    if args.approve_catalog:
        with connection() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE service SET status = 'approved', verified_at = now(),"
                " verified_by = 'dev-bootstrap' WHERE status <> 'approved'"
            )
            cur.execute("UPDATE faq SET status = 'approved'")
        print("⚠ همهٔ خدمات به صورت ساختگی approved شدند — فقط برای دمو.")
        from daadno.indexer import reindex_all

        print(f"  چانک‌های بازساخته: {reindex_all()}")

    if args.approve_rule:
        if args.approve_rule_days is None:
            raise SystemExit("--approve-rule-days لازم است")
        with connection() as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO legal_ref (law_title, article, quote)"
                " VALUES ('[دمو] مستند ساختگی', '[دمو]', 'مقدار واقعی را کارشناس حقوقی"
                " وارد می‌کند') RETURNING id"
            )
            ref_id = cur.fetchone()["id"]
            cur.execute(
                "UPDATE deadline_rule SET duration_value = %s, legal_ref_id = %s,"
                " status = 'approved', approved_by = 'dev-bootstrap', approved_at = now()"
                " WHERE code = %s",
                (args.approve_rule_days, ref_id, args.approve_rule),
            )
            if cur.rowcount == 0:
                raise SystemExit(f"قاعدهٔ {args.approve_rule} پیدا نشد")
        print(f"⚠ قاعدهٔ {args.approve_rule} با عدد ساختگی approve شد — فقط برای دمو.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
