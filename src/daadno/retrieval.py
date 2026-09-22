"""بازیابی — پوشش نازک روی ``hybrid_search`` در دیتابیس.

هیچ منطق رتبه‌بندی‌ای اینجا تکرار نمی‌شود؛ RRF در SQL است و اینجا فقط
چانک‌ها به متن قابل مصرف پرامپت تبدیل می‌شوند.
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import get_settings
from .db import connection
from .embeddings import get_provider


@dataclass
class RetrievedChunk:
    chunk_id: int
    service_id: str
    service_slug: str
    service_title: str
    section: str
    text: str
    score: float
    distance: float


def retrieve(query: str, limit: int | None = None) -> list[RetrievedChunk]:
    settings = get_settings()
    limit = limit or settings.retrieval_limit
    vector = get_provider().embed_one(query)

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT h.chunk_id, h.service_id, h.score,
                   c.section, c.text,
                   (c.embedding <=> %s::vector) AS distance,
                   s.slug AS service_slug, s.title_fa AS service_title
            FROM hybrid_search(%s, %s::vector, %s) h
            JOIN service_chunk c ON c.id = h.chunk_id
            JOIN service s       ON s.id = h.service_id
            ORDER BY h.score DESC
            """,
            (str(vector), query, str(vector), limit),
        )
        rows = cur.fetchall()

    return [
        RetrievedChunk(
            chunk_id=r["chunk_id"],
            service_id=str(r["service_id"]),
            service_slug=r["service_slug"],
            service_title=r["service_title"],
            section=r["section"],
            text=r["text"],
            score=float(r["score"]),
            distance=float(r["distance"]) if r["distance"] is not None else 1.0,
        )
        for r in rows
    ]


def top_score(chunks: list[RetrievedChunk]) -> float:
    return chunks[0].score if chunks else 0.0


def best_distance(chunks: list[RetrievedChunk]) -> float:
    """نزدیک‌ترین فاصلهٔ کسینوسی در میان نتایج. ۱.۰ یعنی «هیچ‌چیز نزدیک نیست»."""
    return min((c.distance for c in chunks), default=1.0)


def passes_gate(chunks: list[RetrievedChunk], min_score: float, max_distance: float) -> bool:
    """دروازهٔ pre-flight — دو شرط، نه یکی.

    امتیاز RRF به تنهایی تبعیض‌گر نیست: بازوی برداری ``hybrid_search`` یک
    kNN بدون فیلتر است و همیشه ۱۰۰ ردیف برمی‌گرداند، پس هر پرسشی — حتی
    «قیمت دلار چنده» — دست‌کم ``1/(k+1)`` امتیاز می‌گیرد. برای همین علاوه بر
    آستانهٔ امتیاز، یک کف شباهت واقعی هم لازم است.

    قرارداد ``db/002_search.sql`` دست‌نخورده می‌ماند؛ این شرط دوم در لایهٔ
    فراخوان اعمال می‌شود.
    """
    if not chunks:
        return False
    return top_score(chunks) >= min_score and best_distance(chunks) <= max_distance


def group_by_service(chunks: list[RetrievedChunk]) -> list[dict]:
    """چانک‌ها را به خدمت جمع می‌کند و امتیاز هر خدمت را جمع امتیاز چانک‌هایش می‌گیرد."""
    grouped: dict[str, dict] = {}
    for chunk in chunks:
        entry = grouped.setdefault(
            chunk.service_slug,
            {
                "slug": chunk.service_slug,
                "service_id": chunk.service_id,
                "title_fa": chunk.service_title,
                "score": 0.0,
                "chunk_ids": [],
            },
        )
        entry["score"] += chunk.score
        entry["chunk_ids"].append(chunk.chunk_id)
    return sorted(grouped.values(), key=lambda e: e["score"], reverse=True)
