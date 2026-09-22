#!/usr/bin/env python3
"""کالیبراسیون دروازهٔ pre-flight روی مجموعهٔ طلایی.

``prompts/02_answer.md`` می‌گوید آستانه «روی golden set کالیبره شود». این
اسکریپت همان کار را می‌کند: فاصلهٔ کسینوسی بهترین چانک را برای ردیف‌های
درون‌دامنه و بیرون‌دامنه جدا می‌کند و برشی را پیشنهاد می‌دهد که بیشترین
جدایی را بدهد.

مهم: این عدد به ارائه‌دهندهٔ امبدینگ گره خورده است. با تعویض provider
(T-102) باید دوباره اجرا شود؛ عدد قدیمی با مدل جدید بی‌معناست.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from daadno import retrieval  # noqa: E402
from daadno.embeddings import get_provider  # noqa: E402


def collect(rows: list[dict]) -> tuple[list[float], list[float]]:
    in_scope, out_of_scope = [], []
    for row in rows:
        chunks = retrieval.retrieve(row["text"])
        distance = retrieval.best_distance(chunks)
        (out_of_scope if row.get("expect_refusal") else in_scope).append(distance)
    return in_scope, out_of_scope


def suggest(in_scope: list[float], out_of_scope: list[float]) -> dict:
    """برشی که هر دو خطا را کم کند، با وزن بیشتر روی «پاسخ به بی‌ربط».

    پاسخ دادن به پرسش بیرون‌دامنه بدتر از امتناع بی‌جاست: اولی اعتماد را
    می‌شکند، دومی فقط آزاردهنده است. پس خطای نوع اول دو برابر وزن دارد.
    """
    candidates = sorted({round(d, 4) for d in in_scope + out_of_scope})
    best, best_cost = None, None
    for cut in candidates:
        false_answers = sum(1 for d in out_of_scope if d <= cut)
        false_refusals = sum(1 for d in in_scope if d > cut)
        cost = false_answers * 2 + false_refusals
        if best_cost is None or cost < best_cost:
            best, best_cost = cut, cost
    margin = min(out_of_scope) - max(in_scope) if in_scope and out_of_scope else 0.0
    return {"cut": best, "cost": best_cost, "margin": round(margin, 4)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--set", dest="path", default=None)
    args = parser.parse_args()

    path = Path(args.path) if args.path else ROOT / "eval" / "golden_set.jsonl"
    if not path.exists():
        path = ROOT / "eval" / "golden_set.sample.jsonl"
    lines = path.read_text(encoding="utf-8").splitlines()
    rows = [json.loads(line) for line in lines if line.strip()]

    in_scope, out_of_scope = collect(rows)
    if not in_scope or not out_of_scope:
        raise SystemExit("مجموعه باید هم ردیف درون‌دامنه داشته باشد هم ردیف expect_refusal.")

    result = suggest(in_scope, out_of_scope)
    provider = get_provider()

    print(f"ارائه‌دهندهٔ امبدینگ: {provider.name} (dim={provider.dim})")
    print(
        f"مجموعه: {path.relative_to(ROOT)} — {len(in_scope)} درون‌دامنه، "
        f"{len(out_of_scope)} بیرون‌دامنه"
    )
    print(f"\nفاصلهٔ درون‌دامنه   کمینه {min(in_scope):.4f}  بیشینه {max(in_scope):.4f}")
    print(f"فاصلهٔ بیرون‌دامنه  کمینه {min(out_of_scope):.4f}  بیشینه {max(out_of_scope):.4f}")
    print(
        f"حاشیهٔ جدایی: {result['margin']:+.4f}  "
        f"({'قابل تفکیک' if result['margin'] > 0 else 'همپوشانی دارد'})"
    )
    print(f"\nبرش پیشنهادی: DAADNO_MAX_DISTANCE_ASK={result['cut']}")
    print(f"هزینهٔ خطا در این برش: {result['cost']} " "(پاسخ به بی‌ربط ×۲ + امتناع بی‌جا ×۱)")

    if len(rows) < 50:
        print(
            "\n⚠ این مجموعه کوچک است و عدد بالا آماری نیست. تا رسیدن به ۲۰۰ ردیف "
            "(T-105) آن را مبنای انتشار نگذارید."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
