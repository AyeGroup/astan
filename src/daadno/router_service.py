"""‏POST /route — متن آزاد کاربر → نامزدها + پرسش تفکیکی. T-103.

بدون عوارض جانبی. هرگز پاسخ نهایی تولید نمی‌کند و هرگز عدد نمی‌نویسد.
"""

from __future__ import annotations

import logging
import time

from . import answer_log, prompts, retrieval
from .config import get_settings
from .db import fetch_all
from .guards import validate_router_output
from .llm import get_client

log = logging.getLogger(__name__)

MAX_CANDIDATES = 5


def route(
    text: str,
    *,
    persona: str | None = None,
    answers: dict | None = None,
    session_id: str = "anonymous",
    user_id: str | None = None,
) -> dict:
    started = time.monotonic()
    settings = get_settings()

    chunks = retrieval.retrieve(text)
    grouped = retrieval.group_by_service(chunks)[:MAX_CANDIDATES]
    chunk_ids = [c.chunk_id for c in chunks]
    score = retrieval.top_score(chunks)

    if not grouped or not retrieval.passes_gate(
        chunks, settings.threshold_route, settings.max_distance_route
    ):
        # چیزی برای انتخاب نداریم. حدس زدن بدترین حالت است.
        answer_log.record(
            kind="route",
            session_id=session_id,
            user_id=user_id,
            question=text,
            chunk_ids=chunk_ids,
            top_score=score,
            refused=True,
            refusal_reason="low_recall",
        )
        return {
            "candidates": [],
            "clarifying_questions": _fallback_questions(),
            "confident": False,
        }

    enriched = _enrich(grouped)
    allowed = {c["slug"] for c in enriched}

    client = get_client()
    try:
        raw = client.complete_json(
            prompts.router_system(),
            prompts.render_router_user(enriched, persona, answers, text),
        )
    except Exception:
        # ارائه‌دهنده در دسترس نیست → نامزدهای بازیابی با confident=false.
        log.exception("router llm call failed")
        raw = {}

    validated, violations = validate_router_output(raw, allowed)
    if validated is None:
        if violations:
            log.warning("router output rejected: %s", violations)
        validated = {
            "candidates": [
                {"slug": c["slug"], "score": round(c["score"], 6), "why": "از بازیابی متن پرسش"}
                for c in enriched
            ],
            "clarifying_questions": _fallback_questions(),
            "confident": False,
        }

    by_slug = {c["slug"]: c for c in enriched}
    candidates = [
        {
            "slug": c["slug"],
            "title_fa": by_slug[c["slug"]]["title_fa"],
            "score": c["score"],
            "why": c["why"],
        }
        for c in validated["candidates"]
        if c["slug"] in by_slug
    ]

    result = {
        "candidates": candidates[:MAX_CANDIDATES],
        "clarifying_questions": validated["clarifying_questions"][:3],
        "confident": bool(validated["confident"]) and bool(candidates),
    }

    answer_log.record(
        kind="route",
        session_id=session_id,
        user_id=user_id,
        question=text,
        chunk_ids=chunk_ids,
        top_score=score,
        model=client.name,
        model_called=True,
        service_id=by_slug[candidates[0]["slug"]]["service_id"] if candidates else None,
        latency_ms=int((time.monotonic() - started) * 1000),
    )
    return result


def _enrich(grouped: list[dict]) -> list[dict]:
    """عنوان، خلاصه، مترادف و نقش‌های مجاز — ورودی پرامپت روتر."""
    slugs = [g["slug"] for g in grouped]
    if not slugs:
        return []
    rows = fetch_all(
        """
        SELECT s.slug, s.title_fa, s.summary, s.aliases,
               COALESCE(ARRAY_AGG(pe.persona::text) FILTER (WHERE pe.allowed), '{}')
                 AS allowed_personas
        FROM service_servable s
        LEFT JOIN persona_eligibility pe ON pe.service_id = s.id
        WHERE s.slug = ANY(%s)
        GROUP BY s.slug, s.title_fa, s.summary, s.aliases
        """,
        (slugs,),
    )
    by_slug = {r["slug"]: r for r in rows}
    out = []
    for group in grouped:
        row = by_slug.get(group["slug"])
        if row is None:
            continue
        out.append({**row, "score": group["score"], "service_id": group["service_id"]})
    return out


def _fallback_questions() -> list[dict]:
    """پرسش‌های تفکیکی کلیدی دامنه — prompts/01_router.md."""
    return [
        {
            "id": "counterparty",
            "question": "طرف مقابل شما دستگاه دولتی یا اداری است یا شخص خصوصی؟",
            "options": ["دستگاه دولتی یا اداری", "شخص خصوصی", "مطمئن نیستم"],
        },
        {
            "id": "matter_kind",
            "question": "موضوع شما کیفری است یا حقوقی؟",
            "options": ["کیفری (شکایت از جرم)", "حقوقی (مطالبه یا اختلاف)", "مطمئن نیستم"],
        },
        {
            "id": "case_state",
            "question": "پرونده از قبل تشکیل شده یا تازه می‌خواهید شروع کنید؟",
            "options": ["پرونده در جریان است", "تازه می‌خواهم شروع کنم"],
        },
    ]
