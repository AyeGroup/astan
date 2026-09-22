"""کاتالوگ خدمات.

ENGINEERING_RULES.md §۲: مسیرهای عمومی از ویوی ``service_servable`` (که روی
``service_public`` سوار است) می‌خوانند، نه از جدول خام ``service``. تنها
توابعی که صراحتاً ``servable_only=False`` می‌گیرند — و فقط از مسیر ادمین
صدا زده می‌شوند — حق دیدن رکورد تأییدنشده را دارند.

تست یکپارچگی ``tests/test_rules_ci.py`` مطمئن می‌شود هیچ روتر عمومی‌ای
مستقیماً از جدول ``service`` نمی‌خواند.
"""

from __future__ import annotations

from datetime import UTC
from typing import Any

from .db import connection, fetch_all, fetch_one

_PUBLIC_SOURCE = "service_servable"
_ADMIN_SOURCE = "service"


def _source(servable_only: bool) -> str:
    return _PUBLIC_SOURCE if servable_only else _ADMIN_SOURCE


def list_services(
    *,
    persona: str | None = None,
    category: str | None = None,
    q: str | None = None,
    limit: int = 20,
    cursor: str | None = None,
) -> tuple[list[dict], str | None]:
    where = ["TRUE"]
    params: list[Any] = []

    if category:
        where.append("s.category = %s")
        params.append(category)
    if persona:
        where.append(
            "EXISTS (SELECT 1 FROM persona_eligibility pe"
            " WHERE pe.service_id = s.id AND pe.persona = %s::persona_t AND pe.allowed)"
        )
        params.append(persona)
    if q:
        # جست‌وجوی فوری روی عنوان و مترادف‌ها (T-106). نرمال‌سازی هر دو طرف
        # با همان normalize_fa دیتابیس انجام می‌شود، وگرنه «سنا» به «ثنا» نمی‌رسد.
        where.append(
            "(normalize_fa(s.title_fa) ILIKE '%%' || normalize_fa(%s) || '%%'"
            " OR EXISTS (SELECT 1 FROM unnest(s.aliases) a"
            "            WHERE normalize_fa(a) ILIKE '%%' || normalize_fa(%s) || '%%'))"
        )
        params += [q, q]
    if cursor:
        where.append("s.slug > %s")
        params.append(cursor)

    params.append(limit + 1)
    rows = fetch_all(
        f"""
        SELECT s.slug, s.title_fa, s.summary, s.category, s.verified_at,
               s.needs_review, s.confidence
        FROM {_PUBLIC_SOURCE} s
        WHERE {' AND '.join(where)}
        ORDER BY s.slug
        LIMIT %s
        """,
        params,
    )
    next_cursor = rows[limit - 1]["slug"] if len(rows) > limit else None
    return rows[:limit], next_cursor


def quick_search(q: str, limit: int = 8) -> list[dict]:
    """نتایج فوری صفحهٔ خانه: تطبیق دقیق مترادف اول، بعد تطبیق جزئی."""
    return fetch_all(
        f"""
        SELECT s.slug, s.title_fa, s.summary, s.category,
               CASE
                 WHEN EXISTS (SELECT 1 FROM unnest(s.aliases) a
                              WHERE normalize_fa(a) = normalize_fa(%s)) THEN 0
                 WHEN normalize_fa(s.title_fa) = normalize_fa(%s) THEN 1
                 WHEN normalize_fa(s.title_fa) ILIKE normalize_fa(%s) || '%%' THEN 2
                 WHEN EXISTS (SELECT 1 FROM unnest(s.aliases) a
                              WHERE normalize_fa(a) ILIKE normalize_fa(%s) || '%%') THEN 3
                 ELSE 4
               END AS rank
        FROM {_PUBLIC_SOURCE} s
        WHERE normalize_fa(s.title_fa) ILIKE '%%' || normalize_fa(%s) || '%%'
           OR EXISTS (SELECT 1 FROM unnest(s.aliases) a
                      WHERE normalize_fa(a) ILIKE '%%' || normalize_fa(%s) || '%%')
        ORDER BY rank, s.confidence DESC, s.slug
        LIMIT %s
        """,
        (q, q, q, q, q, q, limit),
    )


def load_service_card(slug: str, *, servable_only: bool = True) -> dict | None:
    row = fetch_one(f"SELECT * FROM {_source(servable_only)} WHERE slug = %s", (slug,))
    return _expand(row) if row else None


def load_service_card_by_id(service_id: str, *, servable_only: bool = True) -> dict | None:
    row = fetch_one(f"SELECT * FROM {_source(servable_only)} WHERE id = %s", (service_id,))
    return _expand(row) if row else None


def _expand(row: dict) -> dict:
    service_id = row["id"]
    card = dict(row)
    card["id"] = str(service_id)
    card.setdefault("needs_review", _is_stale(row))

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT slug, name_fa, url, owner_org, login_method FROM judicial_system"
            " WHERE id = %s",
            (row.get("system_id"),),
        )
        card["system"] = cur.fetchone()

        cur.execute(
            "SELECT persona::text, allowed, restriction_note FROM persona_eligibility"
            " WHERE service_id = %s ORDER BY persona",
            (service_id,),
        )
        card["personas"] = cur.fetchall()

        cur.execute(
            "SELECT kind::text, is_primary, deep_link, note FROM service_channel"
            " WHERE service_id = %s ORDER BY is_primary DESC, kind",
            (service_id,),
        )
        card["channels"] = cur.fetchall()

        cur.execute(
            """
            SELECT dep.slug, dep.title_fa, p.kind::text, p.note
            FROM prerequisite p
            JOIN service dep ON dep.id = p.depends_on_service_id
            WHERE p.service_id = %s
            ORDER BY p.kind, dep.slug
            """,
            (service_id,),
        )
        card["prerequisites"] = cur.fetchall()

        cur.execute(
            "SELECT ord, title, body_md, screen_hint, common_error FROM step"
            " WHERE service_id = %s ORDER BY ord",
            (service_id,),
        )
        card["steps"] = cur.fetchall()

        cur.execute(
            "SELECT name, is_mandatory, format_note FROM required_document"
            " WHERE service_id = %s ORDER BY id",
            (service_id,),
        )
        card["documents"] = cur.fetchall()

        # §۲ — هزینهٔ تأییدنشده هم سرو نمی‌شود.
        cur.execute(
            "SELECT label, basis::text, formula, as_of_year, status::text FROM fee"
            " WHERE service_id = %s ORDER BY id",
            (service_id,),
        )
        card["fees"] = cur.fetchall()

        cur.execute(
            "SELECT id, question, answer_md FROM faq"
            " WHERE service_id = %s AND status = 'approved' ORDER BY"
            " COALESCE(search_volume_hint, 0) DESC, id",
            (service_id,),
        )
        card["faqs"] = cur.fetchall()

        cur.execute(
            "SELECT law_title, article, quote, url FROM legal_ref"
            " WHERE service_id = %s ORDER BY id",
            (service_id,),
        )
        card["legal_refs"] = cur.fetchall()

        # کارت فقط کد قاعده را می‌برد، هرگز عدد مهلت را (§۳).
        cur.execute(
            """
            SELECT r.code, r.title_fa, r.status::text
            FROM service_deadline_rule sdr
            JOIN deadline_rule r ON r.id = sdr.rule_id
            WHERE sdr.service_id = %s
            ORDER BY r.code
            """,
            (service_id,),
        )
        card["related_deadline_rules"] = cur.fetchall()

    return card


def _is_stale(row: dict) -> bool:
    from datetime import datetime

    due = row.get("review_due_at")
    return bool(due and due < datetime.now(UTC))


def public_card(card: dict) -> dict:
    """نمای عمومی کارت — فیلدهای داخلی و هزینه‌های تأییدنشده حذف می‌شوند."""
    out = {
        "slug": card["slug"],
        "title_fa": card["title_fa"],
        "summary": card["summary"],
        "category": card["category"],
        "aliases": card.get("aliases") or [],
        "verified_at": card.get("verified_at"),
        "needs_review": bool(card.get("needs_review")),
        "system": card.get("system"),
        "personas": card.get("personas") or [],
        "channels": card.get("channels") or [],
        "prerequisites": card.get("prerequisites") or [],
        "steps": card.get("steps") or [],
        "documents": card.get("documents") or [],
        "fees": [
            {"label": f["label"], "basis": f["basis"], "as_of_year": f["as_of_year"]}
            for f in (card.get("fees") or [])
            if f.get("status") == "approved"
        ],
        "faqs": card.get("faqs") or [],
        "legal_refs": card.get("legal_refs") or [],
        "related_deadline_rules": [r["code"] for r in (card.get("related_deadline_rules") or [])],
    }
    return out


def version_snapshot(service_id: str) -> dict:
    """اسنپ‌شات کامل برای ``service_version`` — T-003."""
    card = load_service_card_by_id(service_id, servable_only=False)
    if card is None:
        raise LookupError(service_id)
    snapshot = dict(card)
    for key in ("created_at", "updated_at", "verified_at", "review_due_at"):
        value = snapshot.get(key)
        if value is not None:
            snapshot[key] = value.isoformat()
    snapshot["system_id"] = str(snapshot.get("system_id") or "")
    return snapshot
