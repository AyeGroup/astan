"""کلاینت آفلاین — مدل نیست، یک fallback قطعی است.

وجودش دو دلیل دارد: تست‌ها و CI بدون کلید API اجرا شوند، و اگر ارائه‌دهندهٔ
واقعی در دسترس نبود محصول به جای ۵۰۰ دادن، سؤال تفکیکی یا امتناع برگرداند.
هرگز متن راهنما نمی‌سازد؛ فقط از همان چیزی که در SOURCES آمده نقل می‌کند.
"""

from __future__ import annotations

import re

from . import LLMClient

_SOURCE_HEADER = re.compile(r"^\[S(\d+)\]", re.MULTILINE)


class HeuristicClient(LLMClient):
    name = "heuristic"

    def complete_json(self, system: str, user: str) -> dict:
        slugs = re.findall(r"^- slug: (\S+)", user, re.MULTILINE)
        candidates = [
            {"slug": slug, "score": round(1.0 - i * 0.12, 3), "why": "مطابق واژه‌های پرسش شما"}
            for i, slug in enumerate(slugs[:5])
        ]
        # بدون مدل، هرگز مطمئن نیستیم: سؤال تفکیکی می‌پرسیم، حدس نمی‌زنیم.
        return {
            "candidates": candidates,
            "clarifying_questions": [
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
            ],
            "confident": False,
        }

    def complete_text(self, system: str, user: str) -> str:
        blocks = _split_sources(user)
        if not blocks:
            return ""
        first_index, first_text = blocks[0]
        summary = first_text.strip().split("\n")[0][:300]
        parts = [f"{summary} [S{first_index}]"]
        if len(blocks) > 1:
            second_index, second_text = blocks[1]
            extra = second_text.strip().split("\n")[0][:200]
            parts.append(f"{extra} [S{second_index}]")
        return " ".join(parts)


def _split_sources(user: str) -> list[tuple[int, str]]:
    matches = list(_SOURCE_HEADER.finditer(user))
    blocks: list[tuple[int, str]] = []
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(user)
        body = user[match.end() : end]
        body = re.sub(r"^\s*\(خدمت:[^)]*\)\s*", "", body)
        blocks.append((int(match.group(1)), body))
    return blocks
