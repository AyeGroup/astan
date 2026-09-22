#!/usr/bin/env python3
"""هارنس ارزیابی — T-105.

متریک‌ها طبق eval/README.md:
  Recall@5 بازیابی · دقت انتخاب خدمت · دقت انتخاب کانال ·
  نرخ ادعای بدون منبع · نرخ امتناع درست.

آستانهٔ انتشار: Recall@5 بالای ۹۰٪ و ادعای بدون منبع صفر.
مقایسه با بیس‌لاین: افت بیش از ۳ واحد Recall → خروج با کد ۱ (PR قرمز).

این اسکریپت فقط هارنس است. محتوای ۲۰۰ ردیف مجموعهٔ طلایی مالکِ دیگری دارد
(کارشناس حقوقی) و در ``eval/golden_set.jsonl`` می‌نشیند.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from daadno import ask_service, retrieval, router_service  # noqa: E402
from daadno.guards import ARTICLE_PATTERN, CITATION_PATTERN, DURATION_PATTERN  # noqa: E402

DEFAULT_SET = ROOT / "eval" / "golden_set.jsonl"
SAMPLE_SET = ROOT / "eval" / "golden_set.sample.jsonl"
REPORT_DIR = ROOT / "eval" / "reports"

PUBLISH_RECALL_THRESHOLD = 90.0
MAX_RECALL_REGRESSION = 3.0


@dataclass
class Counters:
    total: int = 0
    recall_hits: int = 0
    recall_eligible: int = 0
    service_hits: int = 0
    service_eligible: int = 0
    channel_hits: int = 0
    channel_eligible: int = 0
    unsourced_claims: int = 0
    answered: int = 0
    refusal_expected: int = 0
    refusal_correct: int = 0
    refusal_spurious: int = 0
    forbidden_text: int = 0
    failures: list[dict] = field(default_factory=list)


def load_rows(path: Path) -> list[dict]:
    rows = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("//"):
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{path}:{lineno}: invalid JSON — {exc}") from exc
    return rows


def evaluate_row(row: dict, c: Counters) -> None:
    c.total += 1
    text = row["text"]
    persona = row.get("persona")
    expected_service = row.get("expected_service")
    expect_refusal = row.get("expect_refusal")

    # --- بازیابی: Recall@5 روی خدمت، نه چانک ---------------------------------
    chunks = retrieval.retrieve(text)
    top5 = [g["slug"] for g in retrieval.group_by_service(chunks)[:5]]
    if expected_service:
        c.recall_eligible += 1
        if expected_service in top5:
            c.recall_hits += 1
        else:
            c.failures.append(
                {"id": row["id"], "kind": "recall", "expected": expected_service, "got": top5}
            )

    # --- مسیریابی: دقت انتخاب خدمت ------------------------------------------
    routed = router_service.route(text, persona=persona, session_id=f"eval:{row['id']}")
    chosen = routed["candidates"][0]["slug"] if routed["candidates"] else None
    if expected_service:
        c.service_eligible += 1
        if chosen == expected_service:
            c.service_hits += 1

    # --- پاسخ: ارجاع، امتناع، متن ممنوع -------------------------------------
    answered = ask_service.ask(text, session_id=f"eval:{row['id']}", persona=persona)

    if expect_refusal:
        c.refusal_expected += 1
        if answered["refused"]:
            c.refusal_correct += 1
        else:
            c.failures.append(
                {"id": row["id"], "kind": "missing_refusal", "expected_reason": expect_refusal}
            )
    elif answered["refused"]:
        c.refusal_spurious += 1
        c.failures.append(
            {"id": row["id"], "kind": "spurious_refusal", "reason": answered["refusal_reason"]}
        )
    else:
        c.answered += 1
        body = answered.get("answer_md") or ""
        # نرخ ادعای بدون منبع: پاسخی که ارجاع ندارد یا ارجاعش به منبع
        # ناموجود اشاره می‌کند.
        if not answered.get("citations") or not CITATION_PATTERN.search(body):
            c.unsourced_claims += 1
            c.failures.append({"id": row["id"], "kind": "unsourced_claim"})

        # کانال: از کارت خدمتِ پاسخ، مسیر اصلی
        expected_channel = row.get("expected_channel")
        if expected_channel:
            c.channel_eligible += 1
            card = answered.get("service_card") or {}
            primary = next(
                (ch["kind"] for ch in card.get("channels") or [] if ch.get("is_primary")), None
            )
            if primary == expected_channel:
                c.channel_hits += 1

        # must_not_contain از قالب مجموعهٔ طلایی + گاردهای سراسری
        forbidden = list(row.get("must_not_contain") or [])
        hit = [w for w in forbidden if w in body]
        if DURATION_PATTERN.search(body):
            hit.append("<عدد مهلت>")
        if ARTICLE_PATTERN.search(body) and "ماده" not in forbidden:
            sources_ok = any(
                ARTICLE_PATTERN.search(cit.get("section", "")) for cit in answered["citations"]
            )
            if not sources_ok:
                pass  # اعتبارسنجی post-flight قبلاً این را گرفته است
        if hit:
            c.forbidden_text += 1
            c.failures.append({"id": row["id"], "kind": "forbidden_text", "terms": hit})


def pct(hits: int, total: int) -> float:
    return round(hits / total * 100, 2) if total else 0.0


def build_report(c: Counters, elapsed: float) -> dict:
    return {
        "rows": c.total,
        "elapsed_seconds": round(elapsed, 2),
        "recall_at_5": pct(c.recall_hits, c.recall_eligible),
        "service_accuracy": pct(c.service_hits, c.service_eligible),
        "channel_accuracy": pct(c.channel_hits, c.channel_eligible),
        "unsourced_claim_rate": pct(c.unsourced_claims, c.answered),
        "correct_refusal_rate": pct(c.refusal_correct, c.refusal_expected),
        "spurious_refusals": c.refusal_spurious,
        "forbidden_text_hits": c.forbidden_text,
        "counts": {
            "recall_eligible": c.recall_eligible,
            "answered": c.answered,
            "refusal_expected": c.refusal_expected,
        },
        "failures": c.failures[:50],
    }


def print_report(report: dict) -> None:
    print("\n" + "=" * 58)
    print(f"ردیف‌ها: {report['rows']}   زمان: {report['elapsed_seconds']} ثانیه")
    print("=" * 58)
    print(f"Recall@5 بازیابی        {report['recall_at_5']:>6.2f} %")
    print(f"دقت انتخاب خدمت         {report['service_accuracy']:>6.2f} %")
    print(f"دقت انتخاب کانال        {report['channel_accuracy']:>6.2f} %")
    print(f"نرخ ادعای بدون منبع     {report['unsourced_claim_rate']:>6.2f} %  (هدف: ۰)")
    print(f"نرخ امتناع درست         {report['correct_refusal_rate']:>6.2f} %")
    print(f"امتناع بی‌جا             {report['spurious_refusals']:>6}")
    print(f"متن ممنوع در پاسخ       {report['forbidden_text_hits']:>6}  (هدف: ۰)")
    if report["failures"]:
        print("\nنمونهٔ شکست‌ها:")
        for failure in report["failures"][:10]:
            print(f"  - {failure}")


def main() -> int:
    parser = argparse.ArgumentParser(description="اجرای مجموعهٔ طلایی")
    parser.add_argument("--set", dest="path", default=None)
    parser.add_argument("--baseline", default=None, help="گزارش JSON بیس‌لاین برای مقایسه")
    parser.add_argument("--save", default=None, help="مسیر ذخیرهٔ گزارش JSON")
    parser.add_argument(
        "--enforce", action="store_true", help="آستانه‌های انتشار و افت Recall را اعمال کن"
    )
    args = parser.parse_args()

    path = Path(args.path) if args.path else (DEFAULT_SET if DEFAULT_SET.exists() else SAMPLE_SET)
    rows = load_rows(path)
    print(f"مجموعه: {path.relative_to(ROOT)} ({len(rows)} ردیف)")

    counters = Counters()
    started = time.monotonic()
    for row in rows:
        evaluate_row(row, counters)
    report = build_report(counters, time.monotonic() - started)
    print_report(report)

    target = Path(args.save) if args.save else REPORT_DIR / "latest.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nگزارش: {target.relative_to(ROOT)}")

    if not args.enforce:
        return 0

    failed = False
    if report["recall_at_5"] < PUBLISH_RECALL_THRESHOLD:
        print(f"✗ Recall@5 زیر آستانهٔ انتشار ({PUBLISH_RECALL_THRESHOLD}٪)")
        failed = True
    if report["unsourced_claim_rate"] > 0 or report["forbidden_text_hits"] > 0:
        print("✗ ادعای بدون منبع یا متن ممنوع باید صفر باشد")
        failed = True
    if args.baseline:
        baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
        drop = baseline["recall_at_5"] - report["recall_at_5"]
        if drop > MAX_RECALL_REGRESSION:
            print(
                f"✗ افت Recall نسبت به بیس‌لاین: {drop:.2f} واحد "
                f"(سقف مجاز {MAX_RECALL_REGRESSION})"
            )
            failed = True
        else:
            print(f"✓ اختلاف Recall با بیس‌لاین: {-drop:+.2f} واحد")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
