"""چانک‌ساز و ایندکسر — T-101."""

from __future__ import annotations

from daadno import catalog, chunker, indexer
from daadno.db import connection, fetch_all, fetch_one


def test_todo_content_is_not_indexed():
    """چانک خالی بازیابی را نویزی می‌کند و امتناع درست را خراب می‌کند."""
    service = {
        "title_fa": "خدمت تست",
        "summary": "خلاصهٔ واقعی",
        "steps": [
            {
                "ord": 1,
                "title": "گام یک",
                "body_md": "TODO_CONTENT",
                "common_error": "TODO_CONTENT",
            },
            {"ord": 2, "title": "گام دو", "body_md": "متن واقعی", "common_error": "خطای واقعی"},
        ],
    }
    chunks = chunker.build_chunks(service)
    sections = [(c.section, c.ord) for c in chunks]
    assert ("step", 1) not in sections
    assert ("step", 2) in sections


def test_fee_chunk_carries_no_amount():
    """§۳/§۴ — رقم از ماشین‌حساب می‌آید و نباید از بازیابی به پاسخ برسد."""
    chunks = chunker.build_chunks(
        {
            "title_fa": "خدمت",
            "summary": "خلاصه",
            "fees": [
                {
                    "label": "هزینه دادرسی",
                    "basis": "percentage",
                    "formula": {"rate": 0.035},
                    "as_of_year": 1405,
                },
            ],
        }
    )
    fee_chunk = next(c for c in chunks if c.section == "fee")
    assert "0.035" not in fee_chunk.text
    assert "هزینه دادرسی" in fee_chunk.text


def test_common_error_is_retrievable(db):
    chunks = chunker.build_chunks(
        {
            "title_fa": "ابلاغ",
            "summary": "خلاصه",
            "steps": [
                {
                    "ord": 1,
                    "title": "پیامک",
                    "body_md": "متن",
                    "common_error": "منتظر ماندن برای محتوا در پیامک",
                }
            ],
        }
    )
    step_chunk = next(c for c in chunks if c.section == "step")
    assert "خطای رایج" in step_chunk.text
    assert "منتظر ماندن" in step_chunk.text


def test_editing_a_step_updates_its_chunk(db):
    """معیار پذیرش T-101: ویرایش یک گام → چانک مربوطه به‌روز شود."""
    service = fetch_one("SELECT id FROM service WHERE slug = 'eblagh-electronic'")
    service_id = str(service["id"])
    indexer.index_service(service_id)

    before = fetch_all(
        "SELECT text FROM service_chunk WHERE service_id = %s AND section = 'step'" " AND ord = 1",
        (service_id,),
    )
    assert before

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE step SET common_error = %s WHERE service_id = %s AND ord = 1",
            ("خطای تازه برای تست", service_id),
        )
    indexer.index_service(service_id)

    after = fetch_one(
        "SELECT text, embedding IS NOT NULL AS has_vector FROM service_chunk"
        " WHERE service_id = %s AND section = 'step' AND ord = 1",
        (service_id,),
    )
    assert "خطای تازه برای تست" in after["text"]
    assert after["has_vector"]


def test_reindex_is_idempotent_and_does_not_duplicate(db):
    service_id = str(fetch_one("SELECT id FROM service WHERE slug = 'sana-registration'")["id"])
    first = indexer.index_service(service_id)
    second = indexer.index_service(service_id)
    assert first == second
    count = fetch_one(
        "SELECT COUNT(*) AS n FROM service_chunk WHERE service_id = %s", (service_id,)
    )["n"]
    assert count == first


def test_editing_a_service_enqueues_a_reindex(db):
    """صف بازایندکس روی تغییر خدمت — تریگر دیتابیس، نه یادآوری دستی."""
    service_id = str(fetch_one("SELECT id FROM service WHERE slug = 'sabt-layehe'")["id"])
    with connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM reindex_queue")
        cur.execute("UPDATE service SET summary = summary WHERE id = %s", (service_id,))
    queued = fetch_all("SELECT service_id FROM reindex_queue")
    assert str(queued[0]["service_id"]) == service_id

    result = indexer.drain_queue()
    assert result["failed"] == 0
    assert fetch_all("SELECT 1 FROM reindex_queue") == []


def test_normalised_column_comes_from_the_database(db):
    """§۷ — text_norm باید خروجی normalize_fa باشد، نه محاسبهٔ لایهٔ اپ."""
    row = fetch_one(
        "SELECT text, text_norm, normalize_fa(text) AS expected FROM service_chunk LIMIT 1"
    )
    assert row["text_norm"] == row["expected"]


def test_public_card_hides_internal_fields(db, approved_catalog):
    card = catalog.load_service_card("sana-registration")
    public = catalog.public_card(card)
    assert "id" not in public
    assert "confidence" not in public
    assert "status" not in public
