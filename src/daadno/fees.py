"""ماشین‌حساب هزینه — ``GET /fees/estimate``.

فرمول‌ها از ستون ``fee.formula`` می‌آیند و فقط هزینهٔ ``approved`` وارد
محاسبه می‌شود. اگر نرخی هنوز تأیید نشده، قلم با ``pending: true`` برمی‌گردد
و در جمع نمی‌آید — عدد حدسی بدتر از نبودن عدد است.
"""

from __future__ import annotations

from .db import fetch_all
from .guards import DISCLAIMER_FEE


class UnknownServiceError(LookupError):
    pass


def estimate(service_slug: str, khaste_rial: int | None = None) -> dict:
    rows = fetch_all(
        """
        SELECT f.label, f.basis::text, f.formula, f.as_of_year, f.status::text
        FROM fee f
        JOIN service_servable s ON s.id = f.service_id
        WHERE s.slug = %s
        ORDER BY f.id
        """,
        (service_slug,),
    )
    exists = fetch_all("SELECT 1 FROM service_servable WHERE slug = %s", (service_slug,))
    if not exists:
        raise UnknownServiceError(service_slug)

    items: list[dict] = []
    pending: list[dict] = []
    total = 0
    as_of_year = 0

    for row in rows:
        as_of_year = max(as_of_year, row["as_of_year"] or 0)
        if row["status"] != "approved":
            pending.append({"label": row["label"], "reason": "needs_legal_review"})
            continue
        amount = _apply(row, khaste_rial)
        if amount is None:
            pending.append({"label": row["label"], "reason": "incomplete_formula"})
            continue
        items.append({"label": row["label"], "amount_rial": amount, "basis": row["basis"]})
        total += amount

    return {
        "items": items,
        "pending_items": pending,
        "total_rial": total,
        "as_of_year": as_of_year or None,
        "disclaimer": DISCLAIMER_FEE,
    }


def _apply(row: dict, khaste_rial: int | None) -> int | None:
    basis = row["basis"]
    formula = row.get("formula") or {}

    if basis == "free":
        return 0
    if basis == "fixed":
        amount = formula.get("amount_rial")
        return int(amount) if amount is not None else None
    if basis == "percentage":
        rate = formula.get("rate")
        if rate is None or khaste_rial is None:
            return None
        amount = int(round(khaste_rial * float(rate)))
        minimum, maximum = formula.get("min_rial"), formula.get("max_rial")
        if minimum is not None:
            amount = max(amount, int(minimum))
        if maximum is not None:
            amount = min(amount, int(maximum))
        return amount
    if basis == "tariff_table":
        brackets = formula.get("brackets")
        if not brackets or khaste_rial is None:
            return None
        for bracket in brackets:
            upper = bracket.get("up_to_rial")
            if upper is None or khaste_rial <= int(upper):
                if bracket.get("amount_rial") is not None:
                    return int(bracket["amount_rial"])
                if bracket.get("rate") is not None:
                    return int(round(khaste_rial * float(bracket["rate"])))
                return None
        return None
    return None
