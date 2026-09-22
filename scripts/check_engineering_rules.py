#!/usr/bin/env python3
"""بررسی خودکار قواعد مهندسی — T-006.

هر بند ENGINEERING_RULES.md که بررسی CI دارد، اینجا یک تابع دارد. شکست
بند ۱ و ۲ بلاکر رلیز است (exit 1)؛ بند ۳ طبق خود سند «هشدار در PR» است و
با ``--strict`` به خطا تبدیل می‌شود.

این اسکریپت به دیتابیس نیاز ندارد تا در هر PR، حتی بدون سرویس، اجرا شود.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SCANNED_DIRS = ("src", "scripts", "db", "api", "prompts", "tests", "seed", "eval")
SCANNED_SUFFIXES = {".py", ".sql", ".yaml", ".yml", ".json", ".md", ".ts", ".tsx", ".js", ".html"}
SELF = Path(__file__).name

# --------------------------------------------------------------------------
# استثنای صریح.
#
# چند فایل ناگزیر نام اعتبارنامه را می‌نویسند تا آن را *رد* کنند: رگولار
# اکسپرشن گارد، فهرست سیاه کوئری‌استرینگ، و خود متن قواعد. به جای حدس زدن،
# نشانهٔ صریح می‌خواهیم؛ این‌طور هر استثنا در دیف دیده می‌شود و کسی نمی‌تواند
# بی‌صدا از بررسی رد شود.
#
#     forbidden = {"sana_password"}  # rules-ok(§1): فهرست سیاه، نه ذخیره‌سازی
# --------------------------------------------------------------------------
EXEMPT = re.compile(r"rules-ok\(§(\d)\):\s*\S")

#: استثنای کل فایل — یک خط در سربرگ، برای فایلی که کارش *آزمودن* خود قاعده
#: است و ناگزیر واژه‌های ممنوع را می‌نویسد:
#:
#:     rules-ok-file(§1): این فایل گارد اعتبارنامه را تست می‌کند
#:
#: فقط ۲۵ خط اول خوانده می‌شود تا استثنا در سربرگ بماند و در دیف دیده شود.
EXEMPT_FILE = re.compile(r"rules-ok-file\(§(\d)\):\s*\S")

# --- بند ۱ ------------------------------------------------------------------
# نام فیلد/ستون/پارامتری که اعتبارنامهٔ سامانه دولتی را حمل کند.
CREDENTIAL_PATTERNS = (
    re.compile(r"sana_?password", re.IGNORECASE),
    re.compile(r"sanaPassword"),
    re.compile(r"ثنا[^\n]{0,20}رمز"),
    re.compile(r"رمز[^\n]{0,20}ثنا"),
)

#: در متن مستند (نه کد)، جمله‌ای که می‌گوید «نمی‌گیریم» خودش نقض قاعده نیست.
PROSE_SUFFIXES = {".md", ".yaml", ".yml"}
CREDENTIAL_ALLOWED_PROSE = re.compile(
    r"(نمی[\s‌]*(?:پرسد|پرسیم|پذیرد|پذیریم|گیرد|گیریم|شود|کند)"
    r"|هرگز|ممنوع|نباید|forbidden|never|prohibited)"
)

#: عنوان خدمتِ «تغییر رمز ثنا» دربارهٔ کاری است که کاربر در سامانهٔ دولتی
#: انجام می‌دهد؛ ما آن رمز را نمی‌بینیم. این‌ها محتوای کاتالوگ‌اند، نه فیلد.
CATALOG_PHRASES = re.compile(r"(تغییر رمز ثنا|رمز موقت ثنا|رمز ثنام|انقضای رمز موقت)")

BROWSER_AUTOMATION = re.compile(r"\b(puppeteer|playwright|selenium)\b", re.IGNORECASE)

# --- بند ۳ ------------------------------------------------------------------
DEADLINE_WORDS = ("مهلت", "تجدیدنظر", "واخواهی", "فرجام", "اعتراض", "ابلاغ")
NUMBER_NEXT_TO_DURATION = re.compile(r"[0-9\u06F0-\u06F9]+\s*(?:روز|ماه)")

# --- بند ۷ ------------------------------------------------------------------
#: نرمال‌سازی موازی یعنی *دست‌کاری* کاراکترهای فارسی در پایتون. خودِ نیم‌فاصله
#: در یک کامنت فارسی نرمال‌سازی نیست، پس دنبال فراخوانی تبدیل می‌گردیم که
#: کاراکتر عربی/کنترلی را به شکل escape نوشته باشد.
TEXT_MUTATION = re.compile(r"\.(?:replace|translate|maketrans)\(|re\.sub\(")
FA_CODEPOINT_ESCAPE = re.compile(
    r"\\u(?:200[cdef]|064[0-9a-fA-F]|065[0-2]|0670|06[cC][cC]|0643|064[aA])"
)


def exempt_for(lines: list[str], index: int, rule: str) -> bool:
    """نشانه می‌تواند روی همان خط یا روی خط بلافاصله قبل باشد.

    خط قبل هم پذیرفته می‌شود چون فرمت‌کنندهٔ خودکار کامنت انتهای خط را
    جابه‌جا می‌کند؛ نشانه‌ای که با `ruff format` ناپدید شود، نشانهٔ خوبی نیست.
    """
    for candidate in (lines[index], lines[index - 1] if index else ""):
        match = EXEMPT.search(candidate)
        if match and match.group(1) == rule:
            return True
    return False


def file_exempt_for(text: str, rule: str) -> bool:
    header = "\n".join(text.splitlines()[:25])
    return any(m.group(1) == rule for m in EXEMPT_FILE.finditer(header))


def iter_files() -> list[Path]:
    files: list[Path] = []
    for directory in SCANNED_DIRS:
        base = ROOT / directory
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.suffix in SCANNED_SUFFIXES and path.name != SELF:
                files.append(path)
    return files


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def check_rule_1(files: list[Path]) -> list[str]:
    """§۱ — هیچ اعتبارنامهٔ سامانه دولتی."""
    failures: list[str] = []
    for path in files:
        prose = path.suffix in PROSE_SUFFIXES
        text = path.read_text(encoding="utf-8", errors="replace")
        if file_exempt_for(text, "1"):
            continue
        lines = text.splitlines()
        for lineno, line in enumerate(lines, start=1):
            if not any(p.search(line) for p in CREDENTIAL_PATTERNS):
                continue
            if exempt_for(lines, lineno - 1, "1") or CATALOG_PHRASES.search(line):
                continue
            # در متن مستند، تیتر فهرستِ ممنوعیت‌ها چند خط بالاتر از خود قلم است،
            # پس پنجره‌ای از خطوط قبل هم دیده می‌شود، نه فقط همان خط.
            window = "\n".join(lines[max(0, lineno - 9) : lineno])
            if prose and CREDENTIAL_ALLOWED_PROSE.search(window):
                continue
            failures.append(f"{rel(path)}:{lineno}: {line.strip()[:120]}")
    return failures


def check_rule_1_automation(files: list[Path]) -> list[str]:
    """§۱ — اتوماسیون مرورگر در سرویس‌های عملیاتی، بدون تأییدیه صریح PR."""
    findings: list[str] = []
    for path in files:
        if path.suffix not in {".py", ".ts", ".tsx", ".js"}:
            continue
        if "tests" in path.parts:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for lineno, line in enumerate(text.splitlines(), start=1):
            if BROWSER_AUTOMATION.search(line) and not line.lstrip().startswith("#"):
                findings.append(f"{rel(path)}:{lineno}: {line.strip()[:120]}")
    for name in ("requirements.txt", "requirements-dev.txt", "package.json"):
        path = ROOT / name
        if path.exists() and BROWSER_AUTOMATION.search(path.read_text(encoding="utf-8")):
            findings.append(f"{name}: browser-automation dependency")
    return findings


def check_rule_2_schema() -> list[str]:
    """§۲ — هیچ ستونی برای اعتبارنامه در اسکیما، و ویوی عمومی وجود دارد."""
    failures: list[str] = []
    schema = (ROOT / "db" / "001_schema.sql").read_text(encoding="utf-8")
    if "CREATE OR REPLACE VIEW service_public" not in schema:
        failures.append("db/001_schema.sql: view service_public is missing")
    if "status = 'approved'" not in schema:
        failures.append("db/001_schema.sql: service_public does not filter on approved")
    return failures


def check_rule_2_public_reads() -> list[str]:
    """§۲ — هیچ مسیر عمومی مستقیماً از جدول خام ``service`` نمی‌خواند.

    مسیرهای ادمین مجازند؛ آن‌ها پشت نقش هستند و کارشان دیدن رکورد
    تأییدنشده است.
    """
    failures: list[str] = []
    public_modules = [
        ROOT / "src" / "daadno" / "routers" / "catalog_routes.py",
        ROOT / "src" / "daadno" / "routers" / "routing_routes.py",
        ROOT / "src" / "daadno" / "web" / "routes.py",
        ROOT / "src" / "daadno" / "router_service.py",
        ROOT / "src" / "daadno" / "ask_service.py",
        ROOT / "src" / "daadno" / "fees.py",
    ]
    raw_read = re.compile(r"FROM\s+service\b(?!_)", re.IGNORECASE)
    for path in public_modules:
        if not path.exists():
            failures.append(f"{rel(path)}: expected public module is missing")
            continue
        text = path.read_text(encoding="utf-8")
        for lineno, line in enumerate(text.splitlines(), start=1):
            if raw_read.search(line):
                failures.append(f"{rel(path)}:{lineno}: public path reads raw `service`")
    return failures


def check_rule_3(files: list[Path]) -> list[str]:
    """§۳ — عدد کنار واژه‌های مهلت در ``src/`` و ``prompts/``."""
    findings: list[str] = []
    for path in files:
        parts = path.relative_to(ROOT).parts
        if parts[0] not in {"src", "prompts"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if file_exempt_for(text, "3"):
            continue
        lines = text.splitlines()
        for lineno, line in enumerate(lines, start=1):
            match = NUMBER_NEXT_TO_DURATION.search(line)
            if not match:
                continue
            if not any(word in line for word in DEADLINE_WORDS):
                continue
            # خود الگوی رگولار اکسپرشن مصداق هاردکد نیست؛ بقیهٔ موارد باید
            # نشانهٔ صریح داشته باشند تا در دیف دیده شوند.
            if "\\d" in line or exempt_for(lines, lineno - 1, "3"):
                continue
            findings.append(f"{rel(path)}:{lineno}: {line.strip()[:120]}")
    return findings


def check_rule_3_seed() -> list[str]:
    """§۳ — هیچ قاعده‌ای در seed عدد نداشته باشد."""
    import json

    data = json.loads((ROOT / "seed" / "deadline_rules.json").read_text(encoding="utf-8"))
    return [
        f"seed/deadline_rules.json: rule '{r['code']}' carries duration_value"
        for r in data["rules"]
        if r.get("duration_value") is not None
    ]


def check_rule_3_db_gate() -> list[str]:
    """§۳ — دروازهٔ دیتابیس سر جایش باشد."""
    schema = (ROOT / "db" / "001_schema.sql").read_text(encoding="utf-8")
    if "rule_approved_is_complete" not in schema:
        return ["db/001_schema.sql: CHECK rule_approved_is_complete is missing"]
    return []


def check_rule_7_8() -> list[str]:
    """§۷ و §۸ — نرمال‌سازی یک‌جا، و بدون استمر فارسی."""
    failures: list[str] = []
    search_sql = (ROOT / "db" / "002_search.sql").read_text(encoding="utf-8")
    if "COPY = simple" not in search_sql:
        failures.append("db/002_search.sql: text search config must copy 'simple'")
    if re.search(r"snowball|hunspell|ispell|persian_stem", search_sql, re.IGNORECASE):
        failures.append("db/002_search.sql: a stemmer was added — see §۸")

    # §۷ — نرمال‌سازی موازی در لایهٔ اپ
    for path in (ROOT / "src").rglob("*.py"):
        text = path.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        for lineno, line in enumerate(lines, start=1):
            if not (TEXT_MUTATION.search(line) and FA_CODEPOINT_ESCAPE.search(line)):
                continue
            if exempt_for(lines, lineno - 1, "7"):
                continue
            failures.append(f"{rel(path)}:{lineno}: app-layer Persian normalisation — see §۷")
    return failures


def check_rule_5() -> list[str]:
    """§۵ — متن‌های سلب مسئولیت، فقط یک نسخه و در ``guards.py``."""
    guards = (ROOT / "src" / "daadno" / "guards.py").read_text(encoding="utf-8")
    missing = [
        name
        for name in ("DISCLAIMER_DEADLINE", "DISCLAIMER_DRAFT", "DISCLAIMER_FEE")
        if name not in guards
    ]
    return [f"src/daadno/guards.py: {name} is missing" for name in missing]


def main() -> int:
    parser = argparse.ArgumentParser(description="بررسی قواعد مهندسی")
    parser.add_argument("--strict", action="store_true", help="هشدار بند ۳ هم خطا شود")
    args = parser.parse_args()

    files = iter_files()
    blocking: list[tuple[str, list[str]]] = [
        ("§۱ اعتبارنامهٔ سامانه دولتی", check_rule_1(files)),
        ("§۲ ویو و وضعیت تأیید", check_rule_2_schema()),
        ("§۲ خواندن مستقیم جدول service از مسیر عمومی", check_rule_2_public_reads()),
        ("§۳ عدد در seed", check_rule_3_seed()),
        ("§۳ دروازهٔ دیتابیس", check_rule_3_db_gate()),
        ("§۵ متن سلب مسئولیت", check_rule_5()),
        ("§۷/§۸ نرمال‌سازی و استمر", check_rule_7_8()),
    ]
    warnings: list[tuple[str, list[str]]] = [
        ("§۱ اتوماسیون مرورگر (نیازمند تأییدیه صریح در PR)", check_rule_1_automation(files)),
        ("§۳ عدد مهلت کنار واژه‌های مهلت", check_rule_3(files)),
    ]

    failed = False
    for title, findings in blocking:
        if findings:
            failed = True
            print(f"\n✗ {title} — بلاکر رلیز")
            for line in findings:
                print(f"    {line}")
        else:
            print(f"✓ {title}")

    for title, findings in warnings:
        if findings:
            print(f"\n⚠ {title}")
            for line in findings:
                print(f"    {line}")
            if args.strict:
                failed = True
        else:
            print(f"✓ {title}")

    print(f"\nفایل‌های بررسی‌شده: {len(files)}")
    if failed:
        print("نتیجه: شکست — ENGINEERING_RULES.md را ببینید.")
        return 1
    print("نتیجه: همهٔ بررسی‌ها سبز.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
