"""چانک‌ساز — T-101.

هر خدمت به چانک‌های ``summary`` / ``step`` / ``document`` / ``faq`` / ``fee``
شکسته می‌شود. متن چانک عمداً عنوان خدمت را هم دارد تا بازیابی واژگانی روی
چانک گام، خدمتش را گم نکند.

محتوای ``TODO_CONTENT`` ایندکس نمی‌شود: چانک خالی، بازیابی را نویزی می‌کند
و باعث می‌شود امتناع درست به پاسخ غلط تبدیل شود.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

TODO_MARKERS = ("TODO_CONTENT", "TODO_LEGAL")


@dataclass(frozen=True)
class Chunk:
    section: str
    ord: int
    text: str
    source_ref: str

    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.text.encode()).hexdigest()


def _usable(value: str | None) -> str:
    text = (value or "").strip()
    if not text or any(marker in text for marker in TODO_MARKERS):
        return ""
    return text


def build_chunks(service: dict) -> list[Chunk]:
    """``service`` همان ساختار کارت خدمت است (catalog.load_service_card)."""
    title = service.get("title_fa") or ""
    aliases = " ، ".join(service.get("aliases") or [])
    chunks: list[Chunk] = []

    summary = _usable(service.get("summary"))
    if summary:
        head = f"{title}\nمترادف‌ها: {aliases}\n{summary}" if aliases else f"{title}\n{summary}"
        chunks.append(Chunk("summary", 0, head, "service.summary"))

    for step in service.get("steps") or []:
        body = _usable(step.get("body_md"))
        hint = _usable(step.get("screen_hint"))
        error = _usable(step.get("common_error"))
        if not (body or error):
            continue
        parts = [f"{title} — گام {step['ord']}: {step.get('title') or ''}".strip()]
        if body:
            parts.append(body)
        if hint:
            parts.append(f"راهنمای صفحه: {hint}")
        if error:
            # پرارزش‌ترین فیلد اسکیما؛ جداگانه هم قابل بازیابی می‌ماند.
            parts.append(f"خطای رایج: {error}")
        chunks.append(Chunk("step", int(step["ord"]), "\n".join(parts), f"step:{step['ord']}"))

    for i, doc in enumerate(service.get("documents") or [], start=1):
        name = _usable(doc.get("name"))
        if not name:
            continue
        line = f"{title} — مدرک لازم: {name}"
        if doc.get("is_mandatory") is False:
            line += " (اختیاری)"
        note = _usable(doc.get("format_note"))
        if note:
            line += f"\nنکتهٔ قالب: {note}"
        chunks.append(Chunk("document", i, line, f"document:{name}"))

    for i, item in enumerate(service.get("faqs") or [], start=1):
        question = _usable(item.get("question"))
        answer = _usable(item.get("answer_md"))
        if not (question and answer):
            continue
        chunks.append(
            Chunk("faq", i, f"{title} — {question}\n{answer}", f"faq:{item.get('id', i)}")
        )

    for i, item in enumerate(service.get("fees") or [], start=1):
        label = _usable(item.get("label"))
        if not label:
            continue
        # فقط برچسب و مبنا؛ هیچ رقمی وارد چانک نمی‌شود — رقم از /fees/estimate
        # می‌آید و نباید از مسیر بازیابی به متن پاسخ راه پیدا کند.
        chunks.append(
            Chunk(
                "fee",
                i,
                f"{title} — هزینه: {label} (مبنای محاسبه: {item.get('basis')}،"
                f" تعرفهٔ سال {item.get('as_of_year')})",
                f"fee:{label}",
            )
        )

    return chunks
