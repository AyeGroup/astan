"""مسیرهای کاتالوگ — همگی از ``service_servable`` می‌خوانند (§۲)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from .. import catalog, fees
from ..db import fetch_all

router = APIRouter(tags=["catalog"])


@router.get("/services")
def list_services(
    persona: str | None = None,
    category: str | None = None,
    q: str | None = None,
    limit: int = Query(default=20, le=100, ge=1),
    cursor: str | None = None,
):
    items, next_cursor = catalog.list_services(
        persona=persona, category=category, q=q, limit=limit, cursor=cursor
    )
    return {"items": items, "next_cursor": next_cursor}


@router.get("/services/search")
def quick_search(q: str, limit: int = Query(default=8, le=20, ge=1)):
    """نتایج فوری صفحهٔ خانه — T-106."""
    return {"items": catalog.quick_search(q, limit)}


@router.get("/services/{slug}")
def get_service(slug: str):
    card = catalog.load_service_card(slug)
    if card is None:
        raise HTTPException(404, "service not found")
    return catalog.public_card(card)


@router.get("/fees/estimate")
def estimate_fee(service_slug: str, khaste_rial: int | None = None):
    try:
        return fees.estimate(service_slug, khaste_rial)
    except fees.UnknownServiceError as exc:
        raise HTTPException(404, "service not found") from exc


@router.get("/courts/search")
def search_courts(q: str | None = None, province: str | None = None, limit: int = 20):
    where, params = ["TRUE"], []
    if q:
        where.append("normalize_fa(name_fa) ILIKE '%%' || normalize_fa(%s) || '%%'")
        params.append(q)
    if province:
        where.append("province = %s")
        params.append(province)
    params.append(min(limit, 100))
    rows = fetch_all(
        f"SELECT id, name_fa, kind, province, city, address, phone FROM court"
        f" WHERE {' AND '.join(where)} ORDER BY province, city, name_fa LIMIT %s",
        params,
    )
    return {"items": rows}
