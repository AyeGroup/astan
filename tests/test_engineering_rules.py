"""بررسی‌های CI قواعد مهندسی — T-006.

معیار پذیرش: «افزودن عمدی فیلد ``sana_password`` به یک برنچ آزمایشی →
بیلد قرمز شود.» اینجا همان کار روی یک فایل موقت انجام می‌شود.

rules-ok-file(§1): این فایل خودِ بررسی CI را می‌آزماید.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "scripts" / "check_engineering_rules.py"


def run_checker(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(CHECKER), *args], capture_output=True, text=True)


def test_repository_passes_all_rules():
    result = run_checker()
    assert result.returncode == 0, result.stdout


def test_repository_passes_in_strict_mode():
    result = run_checker("--strict")
    assert result.returncode == 0, result.stdout


def test_adding_a_sana_password_field_turns_the_build_red(tmp_path):
    """معیار پذیرش T-006، کلمه به کلمه."""
    offender = ROOT / "src" / "daadno" / "_ci_probe.py"
    offender.write_text("class Login:\n    sana_password: str\n", encoding="utf-8")
    try:
        result = run_checker()
        assert result.returncode == 1
        assert "sana_password" in result.stdout
        assert "_ci_probe.py" in result.stdout
    finally:
        offender.unlink()

    assert run_checker().returncode == 0


def test_a_hardcoded_deadline_number_is_flagged():
    """§۳ — هشدار در PR، و در حالت strict خطا."""
    offender = ROOT / "src" / "daadno" / "_ci_probe.py"
    offender.write_text('TAJDIDNAZAR = "مهلت تجدیدنظرخواهی ۲۰ روز است"\n', encoding="utf-8")
    try:
        assert run_checker().returncode == 0  # هشدار، نه بلاکر
        assert "عدد مهلت" in run_checker().stdout
        assert run_checker("--strict").returncode == 1
    finally:
        offender.unlink()


def test_a_browser_automation_dependency_is_flagged():
    """§۱ — اتوماسیون مرورگر روی سامانه‌های قوه قضائیه ممنوع است."""
    offender = ROOT / "src" / "daadno" / "_ci_probe.py"
    offender.write_text("import playwright\n", encoding="utf-8")
    try:
        assert "اتوماسیون مرورگر" in run_checker().stdout
        assert run_checker("--strict").returncode == 1
    finally:
        offender.unlink()


def test_removing_the_approved_filter_from_the_public_view_is_blocking(tmp_path):
    """§۲ — ویوی عمومی باید روی approved فیلتر کند."""
    schema = ROOT / "db" / "001_schema.sql"
    original = schema.read_text(encoding="utf-8")
    try:
        schema.write_text(original.replace("status = 'approved'", "TRUE"), encoding="utf-8")
        result = run_checker()
        assert result.returncode == 1
        assert "service_public" in result.stdout or "approved" in result.stdout
    finally:
        schema.write_text(original, encoding="utf-8")

    assert run_checker().returncode == 0


def test_adding_a_stemmer_to_the_search_config_is_blocking():
    """§۸ — «هیچ استمری اضافه نکنید.»"""
    search = ROOT / "db" / "002_search.sql"
    original = search.read_text(encoding="utf-8")
    try:
        search.write_text(
            original.replace(
                "CREATE TEXT SEARCH CONFIGURATION fa (COPY = simple);",
                "CREATE TEXT SEARCH CONFIGURATION fa (COPY = simple);\n"
                "ALTER TEXT SEARCH CONFIGURATION fa ALTER MAPPING FOR word"
                " WITH persian_stem;",
            ),
            encoding="utf-8",
        )
        result = run_checker()
        assert result.returncode == 1
        assert "stemmer" in result.stdout
    finally:
        search.write_text(original, encoding="utf-8")

    assert run_checker().returncode == 0
