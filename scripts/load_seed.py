#!/usr/bin/env python3
"""لودر seed — T-002.

idempotent است: اجرای دوباره هیچ رکورد تکراری نمی‌سازد و
``COUNT(*) FROM service`` همان ۱۲ می‌ماند.

عمداً هیچ ``duration_value``ی پر نمی‌شود. اگر روزی این اسکریپت شروع کند به
حدس زدن عدد مهلت، §۳ شکسته شده است.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from daadno.db import connection  # noqa: E402

SEED_DIR = ROOT / "seed"


def load_systems(cur, systems: list[dict]) -> int:
    for system in systems:
        cur.execute(
            """
            INSERT INTO judicial_system (slug, name_fa, url, owner_org, login_method, notes)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (slug) DO UPDATE SET
              name_fa = EXCLUDED.name_fa,
              url = EXCLUDED.url,
              login_method = EXCLUDED.login_method
            """,
            (
                system["slug"],
                system["name_fa"],
                system.get("url"),
                system.get("owner_org"),
                system.get("login_method"),
                system.get("notes"),
            ),
        )
    return len(systems)


def load_service(cur, service: dict, system_ids: dict[str, int]) -> str:
    cur.execute(
        """
        INSERT INTO service (slug, title_fa, aliases, summary, system_id, category,
                             status, confidence)
        VALUES (%s, %s, %s, %s, %s, %s, %s::verify_status_t, %s)
        ON CONFLICT (slug) DO UPDATE SET
          title_fa = EXCLUDED.title_fa,
          aliases = EXCLUDED.aliases,
          summary = EXCLUDED.summary,
          system_id = EXCLUDED.system_id,
          category = EXCLUDED.category,
          confidence = EXCLUDED.confidence
        RETURNING id
        """,
        (
            service["slug"],
            service["title_fa"],
            service.get("aliases") or [],
            service["summary"],
            system_ids.get(service.get("system")),
            service["category"],
            # §۲ — همهٔ رکوردهای seed تأییدنشده‌اند و به کاربر نهایی سرو نمی‌شوند.
            service.get("status", "needs_legal_review"),
            service.get("confidence", 0),
        ),
    )
    service_id = cur.fetchone()["id"]

    cur.execute("DELETE FROM persona_eligibility WHERE service_id = %s", (service_id,))
    for item in service.get("personas") or []:
        if item.get("allowed") is None:
            # allowed = null یعنی «کارشناس حقوقی هنوز تصمیم نگرفته» — ردیف
            # ساخته نمی‌شود تا با «صریحاً ممنوع» اشتباه نشود.
            continue
        cur.execute(
            "INSERT INTO persona_eligibility (service_id, persona, allowed, restriction_note)"
            " VALUES (%s, %s::persona_t, %s, %s)",
            (service_id, item["persona"], item["allowed"], item.get("restriction_note")),
        )

    cur.execute("DELETE FROM service_channel WHERE service_id = %s", (service_id,))
    for channel in service.get("channels") or []:
        cur.execute(
            "INSERT INTO service_channel (service_id, kind, is_primary, deep_link, note)"
            " VALUES (%s, %s::channel_t, %s, %s, %s)",
            (
                service_id,
                channel["kind"],
                channel.get("is_primary", False),
                channel.get("deep_link"),
                channel.get("note"),
            ),
        )

    cur.execute("DELETE FROM step WHERE service_id = %s", (service_id,))
    for step in service.get("steps") or []:
        cur.execute(
            "INSERT INTO step (service_id, ord, title, body_md, screen_hint, common_error)"
            " VALUES (%s, %s, %s, %s, %s, %s)",
            (
                service_id,
                step["ord"],
                step.get("title") or "",
                step.get("body_md") or "",
                step.get("screen_hint"),
                step.get("common_error"),
            ),
        )

    cur.execute("DELETE FROM required_document WHERE service_id = %s", (service_id,))
    for doc in service.get("documents") or []:
        cur.execute(
            "INSERT INTO required_document (service_id, name, is_mandatory, format_note)"
            " VALUES (%s, %s, %s, %s)",
            (service_id, doc["name"], doc.get("is_mandatory", True), doc.get("format_note")),
        )

    cur.execute("DELETE FROM fee WHERE service_id = %s", (service_id,))
    for item in service.get("fees") or []:
        cur.execute(
            "INSERT INTO fee (service_id, label, basis, formula, as_of_year, status)"
            " VALUES (%s, %s, %s::fee_basis_t, %s, %s, %s::verify_status_t)",
            (
                service_id,
                item["label"],
                item["basis"],
                json.dumps(item.get("formula"), ensure_ascii=False)
                if item.get("formula")
                else None,
                item["as_of_year"],
                item.get("status", "needs_legal_review"),
            ),
        )

    return str(service_id)


def load_prerequisites(cur, services: list[dict]) -> None:
    cur.execute("SELECT slug, id FROM service")
    ids = {r["slug"]: r["id"] for r in cur.fetchall()}
    for service in services:
        service_id = ids.get(service["slug"])
        cur.execute("DELETE FROM prerequisite WHERE service_id = %s", (service_id,))
        for prereq in service.get("prerequisites") or []:
            depends_on = ids.get(prereq["slug"])
            if depends_on is None:
                print(f"  ! پیش‌نیاز ناشناخته: {prereq['slug']} برای {service['slug']}")
                continue
            cur.execute(
                "INSERT INTO prerequisite (service_id, depends_on_service_id, kind, note)"
                " VALUES (%s, %s, %s::prereq_t, %s)"
                " ON CONFLICT (service_id, depends_on_service_id) DO UPDATE"
                " SET kind = EXCLUDED.kind",
                (service_id, depends_on, prereq.get("kind", "hard"), prereq.get("note")),
            )


def load_deadline_rules(cur, data: dict) -> tuple[int, int]:
    for item in data["eblagh_types"]:
        cur.execute(
            "INSERT INTO eblagh_type (code, title_fa) VALUES (%s, %s)"
            " ON CONFLICT (code) DO UPDATE SET title_fa = EXCLUDED.title_fa",
            (item["code"], item["title_fa"]),
        )

    cur.execute("SELECT code, id FROM eblagh_type")
    type_ids = {r["code"]: r["id"] for r in cur.fetchall()}

    for rule in data["rules"]:
        if rule.get("duration_value") is not None:
            raise SystemExit(
                f"قاعدهٔ {rule['code']} در seed عدد دارد. "
                "اعداد مهلت فقط از مسیر تأیید کارشناس حقوقی وارد می‌شوند (§۳)."
            )
        cur.execute(
            """
            INSERT INTO deadline_rule
              (code, title_fa, trigger_type_id, duration_value, duration_unit,
               residency, count_from, skip_holidays, extend_if_ends_on_holiday,
               as_of_year, status)
            VALUES (%s, %s, %s, NULL, %s, %s::residency_t, %s::count_from_t, %s, %s, %s,
                    %s::verify_status_t)
            ON CONFLICT (code) DO UPDATE SET
              title_fa = EXCLUDED.title_fa,
              trigger_type_id = EXCLUDED.trigger_type_id,
              duration_unit = EXCLUDED.duration_unit,
              residency = EXCLUDED.residency,
              count_from = EXCLUDED.count_from,
              skip_holidays = EXCLUDED.skip_holidays,
              extend_if_ends_on_holiday = EXCLUDED.extend_if_ends_on_holiday,
              as_of_year = EXCLUDED.as_of_year
            """,
            (
                rule["code"],
                rule["title_fa"],
                type_ids[rule["trigger_type"]],
                rule.get("duration_unit", "day"),
                rule.get("residency", "inside_iran"),
                rule.get("count_from", "day_after_eblagh"),
                rule.get("skip_holidays", False),
                rule.get("extend_if_ends_on_holiday", True),
                rule["as_of_year"],
                rule.get("status", "needs_legal_review"),
            ),
        )

    for entry in (data.get("holidays") or {}).get("entries") or []:
        cur.execute(
            "INSERT INTO holiday (d, title_fa, is_official, source)"
            " VALUES (%s, %s, %s, %s) ON CONFLICT (d) DO NOTHING",
            (entry["date"], entry["title_fa"], entry.get("is_official", True), entry.get("source")),
        )

    return len(data["eblagh_types"]), len(data["rules"])


def link_service_rules(cur, services: list[dict]) -> None:
    cur.execute("SELECT slug, id FROM service")
    service_ids = {r["slug"]: r["id"] for r in cur.fetchall()}
    cur.execute("SELECT code, id FROM deadline_rule")
    rule_ids = {r["code"]: r["id"] for r in cur.fetchall()}

    for service in services:
        service_id = service_ids[service["slug"]]
        cur.execute("DELETE FROM service_deadline_rule WHERE service_id = %s", (service_id,))
        for code in service.get("deadline_rules") or []:
            if code not in rule_ids:
                print(f"  ! قاعدهٔ ناشناخته: {code} برای {service['slug']}")
                continue
            cur.execute(
                "INSERT INTO service_deadline_rule (service_id, rule_id) VALUES (%s, %s)"
                " ON CONFLICT DO NOTHING",
                (service_id, rule_ids[code]),
            )


def main() -> int:
    parser = argparse.ArgumentParser(description="لود دادهٔ اولیه (idempotent)")
    parser.add_argument("--seed-dir", default=str(SEED_DIR))
    parser.add_argument("--reindex", action="store_true", help="پس از لود، چانک‌ها ساخته شوند")
    args = parser.parse_args()

    seed_dir = Path(args.seed_dir)
    services_doc = json.loads((seed_dir / "services.json").read_text(encoding="utf-8"))
    rules_doc = json.loads((seed_dir / "deadline_rules.json").read_text(encoding="utf-8"))

    with connection() as conn, conn.cursor() as cur:
        n_systems = load_systems(cur, services_doc["systems"])
        cur.execute("SELECT slug, id FROM judicial_system")
        system_ids = {r["slug"]: r["id"] for r in cur.fetchall()}

        for service in services_doc["services"]:
            load_service(cur, service, system_ids)
        load_prerequisites(cur, services_doc["services"])

        n_types, n_rules = load_deadline_rules(cur, rules_doc)
        link_service_rules(cur, services_doc["services"])

        cur.execute("SELECT COUNT(*) AS n FROM service")
        total_services = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM deadline_rule WHERE duration_value IS NOT NULL")
        with_numbers = cur.fetchone()["n"]

    print(f"سامانه‌ها: {n_systems}")
    print(f"خدمات: {total_services}")
    print(f"انواع ابلاغ: {n_types} | قواعد مهلت: {n_rules}")
    print(f"قواعد دارای عدد: {with_numbers} (انتظار: ۰ تا تأیید کارشناس حقوقی)")
    print(f"بک‌لاگ محتوا: {len(services_doc.get('_backlog_services') or [])} خدمت")

    if args.reindex:
        from daadno.indexer import reindex_all

        print(f"چانک‌های ساخته‌شده: {reindex_all()}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
