"""ایندکسر و ورکر بازایندکس — T-101.

نرمال‌سازی در همین‌جا هم انجام نمی‌شود: ``text_norm`` با فراخوانی
``normalize_fa()`` در همان INSERT ساخته می‌شود (ENGINEERING_RULES.md §۷).
"""

from __future__ import annotations

import logging

from . import catalog
from .db import connection
from .embeddings import get_provider

log = logging.getLogger(__name__)


def index_service(service_id: str) -> int:
    """چانک‌های یک خدمت را می‌سازد و upsert می‌کند. تعداد چانک نهایی را برمی‌گرداند."""
    card = catalog.load_service_card_by_id(service_id, servable_only=False)
    if card is None:
        _delete_missing(service_id, set())
        return 0

    from .chunker import build_chunks

    chunks = build_chunks(card)
    if not chunks:
        _delete_missing(service_id, set())
        return 0

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT section, ord, content_hash FROM service_chunk WHERE service_id = %s",
            (service_id,),
        )
        existing = {(r["section"], r["ord"]): r["content_hash"] for r in cur.fetchall()}

        stale = [c for c in chunks if existing.get((c.section, c.ord)) != c.content_hash]
        vectors = get_provider().embed([c.text for c in stale]) if stale else []

        for chunk, vector in zip(stale, vectors, strict=True):
            cur.execute(
                """
                INSERT INTO service_chunk
                    (service_id, section, ord, text, text_norm, embedding,
                     source_ref, content_hash, updated_at)
                VALUES (%s, %s, %s, %s, normalize_fa(%s), %s::vector, %s, %s, now())
                ON CONFLICT (service_id, section, ord) DO UPDATE SET
                    text = EXCLUDED.text,
                    text_norm = EXCLUDED.text_norm,
                    embedding = EXCLUDED.embedding,
                    source_ref = EXCLUDED.source_ref,
                    content_hash = EXCLUDED.content_hash,
                    updated_at = now()
                """,
                (
                    service_id,
                    chunk.section,
                    chunk.ord,
                    chunk.text,
                    chunk.text,
                    str(vector),
                    chunk.source_ref,
                    chunk.content_hash,
                ),
            )

        _delete_missing(service_id, {(c.section, c.ord) for c in chunks}, cur=cur)

    return len(chunks)


def _delete_missing(service_id: str, keep: set[tuple[str, int]], cur=None) -> None:
    sql = "DELETE FROM service_chunk WHERE service_id = %s"
    params: list = [service_id]
    if keep:
        sql += " AND (section, ord) NOT IN (" + ",".join(["(%s,%s)"] * len(keep)) + ")"
        for section, ord_ in keep:
            params += [section, ord_]
    if cur is not None:
        cur.execute(sql, params)
        return
    with connection() as conn, conn.cursor() as c:
        c.execute(sql, params)


def drain_queue(limit: int = 50) -> dict[str, int]:
    """ورکر بازایندکس: صف را خالی می‌کند. idempotent است."""
    with connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT service_id FROM reindex_queue ORDER BY enqueued_at LIMIT %s", (limit,))
        pending = [r["service_id"] for r in cur.fetchall()]

    indexed = failed = 0
    for service_id in pending:
        try:
            index_service(service_id)
        except Exception as exc:  # ورکر روی یک رکورد خراب نمی‌ایستد
            failed += 1
            log.exception("reindex failed for %s", service_id)
            with connection() as conn, conn.cursor() as cur:
                cur.execute(
                    "UPDATE reindex_queue SET attempts = attempts + 1, last_error = %s"
                    " WHERE service_id = %s",
                    (str(exc)[:500], service_id),
                )
            continue
        indexed += 1
        with connection() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM reindex_queue WHERE service_id = %s", (service_id,))

    return {"indexed": indexed, "failed": failed, "pending": len(pending)}


def reindex_all() -> int:
    with connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM service")
        ids = [r["id"] for r in cur.fetchall()]
    return sum(index_service(str(i)) for i in ids)
