"""‏POST /ask — پاسخ گراندشده، یا امتناع. T-104.

ترتیب اجرا عمداً این است و جابه‌جا نمی‌شود:

  ۱. بررسی بحران (کد)        → امتناع، مدل صدا زده نمی‌شود
  ۲. بازیابی                  → hybrid_search
  ۳. دروازهٔ pre-flight (کد)  → زیر آستانه یعنی امتناع، مدل صدا زده نمی‌شود
  ۴. فراخوانی مدل
  ۵. اعتبارسنجی post-flight (کد)
  ۶. لاگ — در هر شاخه، از جمله امتناع‌ها
"""

from __future__ import annotations

import logging
import time

from . import answer_log, catalog, guards, prompts, retrieval
from .config import get_settings
from .llm import get_client

log = logging.getLogger(__name__)

REFUSAL_TEXTS = {
    guards.REFUSAL_LOW_RECALL: (
        "برای این پرسش منبع تأییدشده‌ای در کاتالوگ ندارم، پس پاسخ نمی‌دهم. "
        "اگر موضوع را کمی دقیق‌تر بنویسید یا از فهرست خدمات انتخاب کنید، دقیق‌تر راهنمایی می‌کنم."
    ),
    guards.REFUSAL_OUT_OF_SCOPE: (
        "این پرسش خارج از دامنهٔ خدمات قضایی است. من فقط دربارهٔ فرایند سامانه‌های "
        "قضایی راهنمایی می‌کنم."
    ),
    guards.REFUSAL_NEEDS_HUMAN: (
        "این مورد نیاز به بررسی انسانی دارد. پیشنهاد می‌کنم با وکیل یا دفتر خدمات "
        "الکترونیک قضایی مشورت کنید."
    ),
    guards.REFUSAL_CRISIS: (
        "اگر در خطر فوری هستید، با ۱۱۰ (پلیس) یا ۱۲۳ (اورژانس اجتماعی) تماس بگیرید. "
        "این موضوع از راهنمایی فرایندی فراتر است و باید همین حالا به یک انسان برسد."
    ),
}


def ask(
    text: str,
    *,
    session_id: str,
    persona: str | None = None,
    user_id: str | None = None,
) -> dict:
    started = time.monotonic()
    settings = get_settings()

    # ۱ — بحران: پیش از هر چیز، و بدون مدل.
    if guards.detect_crisis(text):
        return _refuse(
            guards.REFUSAL_CRISIS,
            text,
            [],
            0.0,
            session_id=session_id,
            user_id=user_id,
            started=started,
        )

    # ۲ — بازیابی
    chunks = retrieval.retrieve(text)
    score = retrieval.top_score(chunks)
    chunk_ids = [c.chunk_id for c in chunks]

    # ۳ — دروازهٔ pre-flight. مهم‌ترین گاردریل سیستم.
    if not retrieval.passes_gate(chunks, settings.threshold_ask, settings.max_distance_ask):
        # «هیچ چانکی» یعنی خارج از دامنه؛ «چانک هست ولی دور» یعنی بازیابی ضعیف.
        reason = (
            guards.REFUSAL_OUT_OF_SCOPE
            if not chunks or retrieval.best_distance(chunks) > settings.max_distance_route
            else guards.REFUSAL_LOW_RECALL
        )
        return _refuse(
            reason,
            text,
            chunk_ids,
            score,
            session_id=session_id,
            user_id=user_id,
            started=started,
        )

    selected = chunks[: settings.answer_chunk_limit]
    sources = [
        {"service_slug": c.service_slug, "section": c.section, "text": c.text} for c in selected
    ]

    # ۴ — مدل
    client = get_client()
    try:
        raw = client.complete_text(
            prompts.answer_system(), prompts.render_answer_user(sources, persona, text)
        )
    except Exception:
        log.exception("answer llm call failed")
        return _refuse(
            guards.REFUSAL_NEEDS_HUMAN,
            text,
            chunk_ids,
            score,
            session_id=session_id,
            user_id=user_id,
            started=started,
            model=client.name,
            model_called=True,
        )

    # ۵ — اعتبارسنجی post-flight
    result = guards.validate_answer(raw, sources)
    if result.violations:
        log.warning("answer violations: %s", result.violations)
    if result.rejected:
        return _refuse(
            result.refusal_reason or guards.REFUSAL_LOW_RECALL,
            text,
            chunk_ids,
            score,
            session_id=session_id,
            user_id=user_id,
            started=started,
            model=client.name,
            model_called=True,
        )

    citations = [
        {
            "service_slug": selected[i].service_slug,
            "section": selected[i].section,
            "chunk_id": selected[i].chunk_id,
        }
        for i in result.cited_indexes
    ]
    # §۴ — پاسخ بدون ارجاع = پاسخ ندادن. این شرط بالادست هم بررسی شده،
    # اینجا هم بررسی می‌شود چون قرارداد API روی همین آرایه ایستاده است.
    if not citations:
        return _refuse(
            guards.REFUSAL_LOW_RECALL,
            text,
            chunk_ids,
            score,
            session_id=session_id,
            user_id=user_id,
            started=started,
            model=client.name,
            model_called=True,
        )

    primary_slug = selected[result.cited_indexes[0]].service_slug
    card = catalog.load_service_card(primary_slug)
    primary_id = selected[result.cited_indexes[0]].service_id

    answer_log.record(
        kind="ask",
        session_id=session_id,
        user_id=user_id,
        question=text,
        chunk_ids=chunk_ids,
        answer_md=result.text,
        model=client.name,
        model_called=True,
        top_score=score,
        service_id=primary_id,
        latency_ms=int((time.monotonic() - started) * 1000),
    )

    return {
        "answer_md": result.text,
        "citations": citations,
        "service_card": catalog.public_card(card) if card else None,
        "refused": False,
        "refusal_reason": None,
    }


def _refuse(
    reason: str,
    text: str,
    chunk_ids: list[int],
    score: float,
    *,
    session_id: str,
    user_id: str | None,
    started: float,
    model: str = "none",
    model_called: bool = False,
) -> dict:
    message = REFUSAL_TEXTS.get(reason, REFUSAL_TEXTS[guards.REFUSAL_LOW_RECALL])
    answer_log.record(
        kind="ask",
        session_id=session_id,
        user_id=user_id,
        question=text,
        chunk_ids=chunk_ids,
        answer_md=message,
        model=model,
        model_called=model_called,
        top_score=score,
        refused=True,
        refusal_reason=reason,
        latency_ms=int((time.monotonic() - started) * 1000),
    )
    return {
        "answer_md": message,
        "citations": [],
        "service_card": None,
        "refused": True,
        "refusal_reason": reason,
    }
