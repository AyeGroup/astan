"""مسیرهای ادمین — T-003، T-004، T-203.

اینها تنها جایی هستند که اجازه دارند رکورد تأییدنشده را ببینند
(``servable_only=False``). هر نوشتن روی خدمت، یک رکورد ``service_version``
با اسنپ‌شات کامل می‌سازد؛ تأیید حقوقی فقط با نقش ``legal_reviewer``.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Body, Depends, HTTPException
from psycopg.errors import CheckViolation

from .. import catalog, deadlines, indexer
from ..db import connection, fetch_all, fetch_one
from ..deps import current_staff, require_legal_reviewer, require_role
from ..security import ROLE_EDITOR

router = APIRouter(prefix="/admin", tags=["admin"])

_SERVICE_COLUMNS = (
    "slug",
    "title_fa",
    "aliases",
    "summary",
    "system_id",
    "category",
    "is_active",
    "confidence",
)


@router.get("/services")
def admin_list(staff: dict = Depends(current_staff)):
    rows = fetch_all(
        "SELECT id, slug, title_fa, category, status::text, confidence,"
        " verified_at, review_due_at FROM service ORDER BY slug"
    )
    return {"items": [{**r, "id": str(r["id"])} for r in rows]}


@router.get("/services/{service_id}")
def admin_get(service_id: str, staff: dict = Depends(current_staff)):
    card = catalog.load_service_card_by_id(service_id, servable_only=False)
    if card is None:
        raise HTTPException(404, "service not found")
    return card


@router.post("/services", status_code=201)
def upsert_service(payload: dict = Body(...), staff: dict = Depends(require_role(ROLE_EDITOR))):
    """ایجاد یا ویرایش خدمت. هر نوشتن یک نسخهٔ جدید می‌سازد."""
    slug = payload.get("slug")
    if not slug:
        raise HTTPException(422, "slug is required")

    fields = {k: payload.get(k) for k in _SERVICE_COLUMNS if k in payload}
    existing = fetch_one("SELECT id FROM service WHERE slug = %s", (slug,))

    if existing is None:
        for required in ("title_fa", "summary", "category"):
            if not fields.get(required):
                raise HTTPException(422, f"{required} is required for a new service")
        fields["slug"] = slug
        columns = list(fields)
        with connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO service ({', '.join(columns)})"
                f" VALUES ({', '.join(['%s'] * len(columns))}) RETURNING id",
                [fields[c] for c in columns],
            )
            service_id = str(cur.fetchone()["id"])
    else:
        # ویرایش جزئی: فقط ستون‌هایی که در payload آمده‌اند نوشته می‌شوند.
        # INSERT ... ON CONFLICT اینجا کار نمی‌کند، چون تلاش درج همچنان
        # ستون‌های NOT NULL را می‌خواهد.
        service_id = str(existing["id"])
        fields.pop("slug", None)
        if fields:
            assignments = ", ".join(f"{c} = %s" for c in fields)
            with connection() as conn, conn.cursor() as cur:
                cur.execute(
                    f"UPDATE service SET {assignments} WHERE id = %s",
                    [*fields.values(), service_id],
                )

    # ویرایش محتوا وضعیت تأیید را باطل می‌کند: محتوایی که عوض شده،
    # دیگر همان چیزی نیست که کارشناس حقوقی تأیید کرده بود (§۲).
    if existing is not None and payload.get("invalidate_approval", True):
        with connection() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE service SET status = 'needs_legal_review', verified_at = NULL,"
                " review_due_at = NULL WHERE id = %s AND status = 'approved'",
                (service_id,),
            )

    _replace_children(service_id, payload)
    version = _append_version(service_id, staff, payload.get("changelog"))
    indexer.index_service(service_id)

    return {"id": service_id, "version": version}


def _replace_children(service_id: str, payload: dict) -> None:
    """بخش‌های فرزند فقط وقتی جایگزین می‌شوند که در payload آمده باشند."""
    with connection() as conn, conn.cursor() as cur:
        if "steps" in payload:
            cur.execute("DELETE FROM step WHERE service_id = %s", (service_id,))
            for step in payload["steps"]:
                cur.execute(
                    "INSERT INTO step (service_id, ord, title, body_md, screen_hint,"
                    " common_error) VALUES (%s, %s, %s, %s, %s, %s)",
                    (
                        service_id,
                        step["ord"],
                        step.get("title") or "",
                        step.get("body_md") or "",
                        step.get("screen_hint"),
                        step.get("common_error"),
                    ),
                )
        if "documents" in payload:
            cur.execute("DELETE FROM required_document WHERE service_id = %s", (service_id,))
            for doc in payload["documents"]:
                cur.execute(
                    "INSERT INTO required_document (service_id, name, is_mandatory,"
                    " format_note) VALUES (%s, %s, %s, %s)",
                    (
                        service_id,
                        doc["name"],
                        doc.get("is_mandatory", True),
                        doc.get("format_note"),
                    ),
                )
        if "channels" in payload:
            cur.execute("DELETE FROM service_channel WHERE service_id = %s", (service_id,))
            for channel in payload["channels"]:
                cur.execute(
                    "INSERT INTO service_channel (service_id, kind, is_primary, deep_link,"
                    " note) VALUES (%s, %s::channel_t, %s, %s, %s)",
                    (
                        service_id,
                        channel["kind"],
                        channel.get("is_primary", False),
                        channel.get("deep_link"),
                        channel.get("note"),
                    ),
                )
        if "personas" in payload:
            cur.execute("DELETE FROM persona_eligibility WHERE service_id = %s", (service_id,))
            for item in payload["personas"]:
                if item.get("allowed") is None:
                    continue
                cur.execute(
                    "INSERT INTO persona_eligibility (service_id, persona, allowed,"
                    " restriction_note) VALUES (%s, %s::persona_t, %s, %s)",
                    (service_id, item["persona"], item["allowed"], item.get("restriction_note")),
                )


def _append_version(service_id: str, staff: dict, changelog: str | None) -> int:
    snapshot = catalog.version_snapshot(service_id)
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT COALESCE(MAX(version), 0) + 1 AS v FROM service_version"
            " WHERE service_id = %s",
            (service_id,),
        )
        version = cur.fetchone()["v"]
        cur.execute(
            "INSERT INTO service_version (service_id, version, payload, changelog, author)"
            " VALUES (%s, %s, %s, %s, %s)",
            (
                service_id,
                version,
                json.dumps(snapshot, ensure_ascii=False, default=str),
                changelog,
                staff.get("sub") or "unknown",
            ),
        )
    return version


@router.get("/services/{service_id}/versions")
def list_versions(service_id: str, staff: dict = Depends(current_staff)):
    rows = fetch_all(
        "SELECT version, changelog, author, published_at FROM service_version"
        " WHERE service_id = %s ORDER BY version DESC",
        (service_id,),
    )
    return {"items": rows}


@router.post("/services/{service_id}/verify")
def verify_service(
    service_id: str,
    payload: dict = Body(default={}),
    staff: dict = Depends(require_legal_reviewer),
):
    """تأیید حقوقی. تنها با نقش ``legal_reviewer`` — ``admin`` کافی نیست."""
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE service SET status = 'approved', verified_at = now(), verified_by = %s"
            " WHERE id = %s RETURNING verified_at, review_due_at",
            (staff.get("sub"), service_id),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(404, "service not found")
        if payload.get("approve_faqs"):
            cur.execute("UPDATE faq SET status = 'approved' WHERE service_id = %s", (service_id,))
        if payload.get("approve_fees"):
            cur.execute("UPDATE fee SET status = 'approved' WHERE service_id = %s", (service_id,))

    indexer.index_service(service_id)
    return {
        "status": "approved",
        "verified_at": row["verified_at"],
        "review_due_at": row["review_due_at"],
    }


@router.get("/rules")
def list_rules(staff: dict = Depends(current_staff)):
    rows = fetch_all(
        "SELECT r.id, r.code, r.title_fa, r.duration_value, r.duration_unit,"
        " r.residency::text, r.status::text, r.legal_ref_id, r.as_of_year,"
        " t.code AS trigger_code"
        " FROM deadline_rule r JOIN eblagh_type t ON t.id = r.trigger_type_id"
        " ORDER BY r.code"
    )
    return {"items": rows}


@router.patch("/rules/{rule_id}")
def update_rule(
    rule_id: int,
    payload: dict = Body(...),
    staff: dict = Depends(require_legal_reviewer),
):
    """اصلاح قاعده. اگر قاعده تأییدشده باشد، نمونه‌های فعالش بازمحاسبه می‌شوند (T-203)."""
    allowed = {
        "duration_value",
        "duration_unit",
        "residency",
        "count_from",
        "skip_holidays",
        "extend_if_ends_on_holiday",
        "legal_ref_id",
        "as_of_year",
    }
    fields = {k: v for k, v in payload.items() if k in allowed}
    if not fields:
        raise HTTPException(422, "nothing to update")

    assignments, params = [], []
    for key, value in fields.items():
        cast = (
            "::residency_t"
            if key == "residency"
            else ("::count_from_t" if key == "count_from" else "")
        )
        assignments.append(f"{key} = %s{cast}")
        params.append(value)
    params.append(rule_id)

    try:
        with connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"UPDATE deadline_rule SET {', '.join(assignments)} WHERE id = %s"
                " RETURNING status::text",
                params,
            )
            row = cur.fetchone()
    except CheckViolation as exc:
        # قاعدهٔ تأییدشده نمی‌تواند عددش یا مستندش خالی شود.
        raise HTTPException(409, "rule would become incomplete while approved") from exc

    if row is None:
        raise HTTPException(404, "rule not found")

    recompute = {"recomputed": 0, "unchanged": 0}
    if row["status"] == "approved":
        recompute = deadlines.recompute_rule(rule_id)
    return {"status": row["status"], **recompute}


@router.post("/rules/{rule_id}/approve")
def approve_rule(rule_id: int, staff: dict = Depends(require_legal_reviewer)):
    """فعال‌سازی قاعده.

    تا وقتی ``duration_value`` و ``legal_ref_id`` پر نباشند، دیتابیس با
    ``CHECK rule_approved_is_complete`` این عملیات را رد می‌کند و اینجا به
    ۴۰۹ ترجمه می‌شود، نه ۵۰۰.
    """
    try:
        with connection() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE deadline_rule SET status = 'approved', approved_by = %s,"
                " approved_at = now() WHERE id = %s RETURNING code, duration_value",
                (staff.get("sub"), rule_id),
            )
            row = cur.fetchone()
    except CheckViolation as exc:
        raise HTTPException(
            409, "rule is incomplete: duration_value and legal_ref_id are required"
        ) from exc

    if row is None:
        raise HTTPException(404, "rule not found")
    return {"status": "approved", "code": row["code"]}


@router.post("/reindex")
def reindex(staff: dict = Depends(current_staff), all_services: bool = False):
    if all_services:
        return {"chunks": indexer.reindex_all()}
    return indexer.drain_queue()


@router.get("/answer-log")
def answer_log(limit: int = 50, refused: bool | None = None, staff: dict = Depends(current_staff)):
    where, params = ["TRUE"], []
    if refused is not None:
        where.append("refused = %s")
        params.append(refused)
    params.append(min(limit, 500))
    rows = fetch_all(
        f"SELECT id, kind, session_id, question, chosen_service_id, model, model_called,"
        f" top_score, refused, refusal_reason, latency_ms, created_at,"
        f" array_length(retrieved_chunk_ids, 1) AS chunk_count"
        f" FROM answer_log WHERE {' AND '.join(where)}"
        f" ORDER BY created_at DESC LIMIT %s",
        params,
    )
    return {"items": [{**r, "chosen_service_id": str(r["chosen_service_id"] or "")} for r in rows]}
