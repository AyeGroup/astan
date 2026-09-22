"""لاگ پاسخ — §۴: «هر پاسخ، شامل امتناع‌ها، با retrieved_chunk_ids ثبت می‌شود.»

اگر این لاگ نباشد، معیار پذیرش T-104 («بدون فراخوانی مدل، قابل اثبات در
لاگ») قابل اثبات نیست. پس ``model_called`` هم ستون خودش را دارد.
"""

from __future__ import annotations

import logging

from .db import connection

log = logging.getLogger(__name__)


def record(
    *,
    kind: str,
    session_id: str,
    question: str,
    chunk_ids: list[int],
    answer_md: str = "",
    model: str = "none",
    model_called: bool = False,
    top_score: float | None = None,
    user_id: str | None = None,
    service_id: str | None = None,
    channel: str | None = None,
    latency_ms: int | None = None,
    refused: bool = False,
    refusal_reason: str | None = None,
) -> int | None:
    try:
        with connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO answer_log
                  (kind, user_id, session_id, question, question_norm,
                   retrieved_chunk_ids, chosen_service_id, chosen_channel,
                   answer_md, model, model_called, top_score, latency_ms,
                   refused, refusal_reason)
                VALUES (%s, %s, %s, %s, normalize_fa(%s), %s, %s, %s::channel_t,
                        %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    kind,
                    user_id,
                    session_id,
                    question,
                    question,
                    chunk_ids,
                    service_id,
                    channel,
                    answer_md,
                    model,
                    model_called,
                    top_score,
                    latency_ms,
                    refused,
                    refusal_reason,
                ),
            )
            return cur.fetchone()["id"]
    except Exception:
        # لاگ نشدن نباید پاسخ کاربر را بخورد، ولی باید دیده شود.
        log.exception("answer_log write failed")
        return None
