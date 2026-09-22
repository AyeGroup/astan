"""پرونده‌های من، ابلاغ، مهلت‌ها و خروجی تقویم — T-204 و T-206."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response

from .. import deadlines, ics, reminders
from ..db import connection, fetch_one
from ..deps import current_user
from ..schemas import CaseCreate, EblaghCreate

router = APIRouter(tags=["cases"])


def _owned_case(case_id: str, user_id: str) -> dict:
    row = fetch_one(
        "SELECT id, label, case_number, court_name, is_closed FROM user_case"
        " WHERE id = %s AND user_id = %s",
        (case_id, user_id),
    )
    if row is None:
        # ۴۰۴ و نه ۴۰۳: وجود پروندهٔ کاربر دیگر لو نمی‌رود.
        raise HTTPException(404, "case not found")
    return row


@router.post("/cases", status_code=201)
def create_case(body: CaseCreate, user: dict = Depends(current_user)):
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO user_case (user_id, label, case_number, court_name)"
            " VALUES (%s, %s, %s, %s)"
            " RETURNING id, label, case_number, court_name, is_closed",
            (user["sub"], body.label, body.case_number, body.court_name),
        )
        row = cur.fetchone()
    return {**row, "id": str(row["id"])}


@router.get("/cases")
def list_cases(user: dict = Depends(current_user)):
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, label, case_number, court_name, is_closed FROM user_case"
            " WHERE user_id = %s ORDER BY created_at DESC",
            (user["sub"],),
        )
        rows = cur.fetchall()
    return {"items": [{**r, "id": str(r["id"])} for r in rows]}


@router.post("/cases/{case_id}/eblagh", status_code=201)
def register_eblagh(case_id: str, body: EblaghCreate, user: dict = Depends(current_user)):
    """ثبت رویداد ابلاغ و محاسبهٔ مهلت‌ها.

    ``seen_at`` را کاربر وارد می‌کند. سرویس هیچ‌جا آن را از سامانهٔ ابلاغ
    نمی‌خواند (§۱).
    """
    _owned_case(case_id, user["sub"])

    try:
        seen_at = date.fromisoformat(body.seen_at)
    except ValueError as exc:
        raise HTTPException(400, "seen_at must be an ISO date") from exc
    if seen_at > date.today():
        raise HTTPException(400, "seen_at cannot be in the future")

    type_row = fetch_one("SELECT id FROM eblagh_type WHERE code = %s", (body.eblagh_type,))
    if type_row is None:
        raise HTTPException(400, "unknown eblagh_type")

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO eblagh_event (case_id, eblagh_type_id, seen_at, residency, note)"
            " VALUES (%s, %s, %s, %s::residency_t, %s) RETURNING id",
            (case_id, type_row["id"], seen_at, body.residency, body.note),
        )
        event_id = str(cur.fetchone()["id"])

    result = deadlines.compute_for_event(event_id)
    for instance_id in result["instance_ids"]:
        reminders.schedule_ladder(instance_id)

    computed = deadlines.list_for_case(case_id)
    by_id = {d["id"]: d for d in computed}
    return {
        "deadlines": [by_id[i] for i in result["instance_ids"] if i in by_id],
        "unavailable_rules": result["unavailable_rules"],
        "holiday_table_empty": deadlines.holiday_table_is_empty(),
    }


@router.get("/cases/{case_id}/deadlines")
def list_deadlines(case_id: str, user: dict = Depends(current_user)):
    _owned_case(case_id, user["sub"])
    return deadlines.list_for_case(case_id)


@router.get("/cases/{case_id}/export.ics")
def export_ics(case_id: str, user: dict = Depends(current_user)):
    case = _owned_case(case_id, user["sub"])
    body = ics.build_calendar(case["label"], deadlines.list_for_case(case_id))
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="daadno-{case_id}.ics"'},
    )
