#!/usr/bin/env python3
"""ورکرهای پس‌زمینه: بازایندکس و یادآور.

هر دو idempotent‌اند، پس ریستارت ورکر نه چانک تکراری می‌سازد نه پیام تکراری
می‌فرستد. حلقه عمداً ساده است؛ وقتی حجم بالا رفت جایش Celery/RQ می‌آید.
"""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from daadno.indexer import drain_queue  # noqa: E402
from daadno.reminders import run_worker  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("worker")

_running = True


def _stop(signum, frame):
    global _running
    log.info("signal %s — draining and exiting", signum)
    _running = False


def tick() -> dict:
    index_result = drain_queue()
    reminder_result = run_worker()
    if index_result["indexed"] or index_result["failed"]:
        log.info("reindex: %s", index_result)
    if reminder_result["sent"]:
        log.info("reminders: %s", reminder_result)
    return {"index": index_result, "reminders": reminder_result}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--interval", type=int, default=60, help="ثانیه بین دو دور")
    parser.add_argument("--once", action="store_true", help="یک دور و خروج")
    args = parser.parse_args()

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    if args.once:
        print(tick())
        return 0

    log.info("worker started (interval=%ss)", args.interval)
    while _running:
        try:
            tick()
        except Exception:
            # یک دور خراب نباید ورکر را بکشد؛ دور بعد دوباره تلاش می‌شود.
            log.exception("worker tick failed")
        for _ in range(args.interval):
            if not _running:
                break
            time.sleep(1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
