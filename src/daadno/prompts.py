"""بارگذاری پرامپت‌ها از ``prompts/*.md``.

متن System داخل همان فایل مستند نگهداری می‌شود تا نسخهٔ اجرایی و نسخهٔ
مستند هرگز از هم جدا نیفتند؛ این فایل فقط بلوک ``## System`` را بیرون می‌کشد.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"

_SYSTEM_BLOCK = re.compile(r"##\s*System\s*\n+```\s*\n(.*?)```", re.DOTALL)


@lru_cache
def system_prompt(name: str) -> str:
    path = PROMPTS_DIR / name
    text = path.read_text(encoding="utf-8")
    match = _SYSTEM_BLOCK.search(text)
    if not match:
        raise ValueError(f"no '## System' block in {path}")
    return match.group(1).strip()


def router_system() -> str:
    return system_prompt("01_router.md")


def answer_system() -> str:
    return system_prompt("02_answer.md")


def render_router_user(
    candidates: list[dict], persona: str | None, answers: dict | None, text: str
) -> str:
    import json

    lines = ["CANDIDATES:"]
    for candidate in candidates:
        lines += [
            f"- slug: {candidate['slug']}",
            f"  عنوان: {candidate['title_fa']}",
            f"  چیست: {candidate.get('summary') or ''}",
            f"  مترادف‌ها: {'، '.join(candidate.get('aliases') or [])}",
            f"  نقش‌های مجاز: {'، '.join(candidate.get('allowed_personas') or [])}",
        ]
    lines += [
        "",
        f"PERSONA: {persona or 'نامشخص'}",
        f"PREVIOUS_ANSWERS: {json.dumps(answers or {}, ensure_ascii=False)}",
        f"USER_TEXT: {text}",
    ]
    return "\n".join(lines)


def render_answer_user(sources: list[dict], persona: str | None, text: str) -> str:
    lines = ["SOURCES:"]
    for i, source in enumerate(sources):
        lines.append(f"[S{i}] (خدمت: {source['service_slug']} / بخش: {source['section']})")
        lines.append(source["text"])
        lines.append("")
    lines += [f"PERSONA: {persona or 'نامشخص'}", f"USER_TEXT: {text}"]
    return "\n".join(lines)
