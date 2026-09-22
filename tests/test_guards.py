"""گاردریل‌ها — قواعد ۳، ۴ و ۵.
rules-ok-file(§1): این فایل خودِ گارد اعتبارنامه را می‌آزماید.
"""

from __future__ import annotations

import pytest

from daadno import guards

SOURCES = [{"text": "برای ثبت‌نام به سامانه ثنا مراجعه کنید."}]


def test_answer_without_citation_is_refused():
    """§۴ — پاسخ بدون ارجاع = پاسخ ندادن."""
    result = guards.validate_answer("به سامانه ثنا مراجعه کنید.", SOURCES)
    assert result.rejected
    assert result.refusal_reason == guards.REFUSAL_LOW_RECALL


def test_citation_out_of_range_is_not_a_citation():
    result = guards.validate_answer("متن [S9]", SOURCES)
    assert result.rejected


def test_valid_citation_passes():
    result = guards.validate_answer("به سامانه ثنا مراجعه کنید [S0].", SOURCES)
    assert result.ok
    assert result.cited_indexes == [0]


@pytest.mark.parametrize("body", ["مهلت شما ۲۰ روز است [S0].", "ظرف 2 ماه اقدام کنید [S0]."])
def test_deadline_number_in_answer_is_rejected(body):
    """§۳ — هیچ عدد مهلتی از متن مدل بیرون نمی‌آید."""
    result = guards.validate_answer(body, SOURCES)
    assert result.rejected
    assert "duration_in_answer" in result.violations


def test_money_in_answer_is_rejected():
    result = guards.validate_answer("هزینه ۵۰۰٬۰۰۰ ریال است [S0].", SOURCES)
    assert result.rejected


def test_unsourced_article_sentence_is_dropped():
    sources = [{"text": "طبق ماده 348 قانون آیین دادرسی مدنی اقدام کنید."}]
    body = "طبق ماده 348 اقدام کنید [S0]. اما ماده 999 هم لازم است [S0]."
    result = guards.validate_answer(body, sources)
    assert result.ok
    assert "ماده 999" not in result.text
    assert "ماده 348" in result.text
    assert "unsourced_article_dropped" in result.violations


def test_legal_advice_is_refused():
    """§۵ — راهنمایی فرایندی، نه مشاوره حقوقی."""
    result = guards.validate_answer("نگران نباشید، حق با شماست [S0].", SOURCES)
    assert result.rejected
    assert result.refusal_reason == guards.REFUSAL_NEEDS_HUMAN


def test_credential_solicitation_is_refused():
    """§۱ — خروجی حق ندارد رمز ثنا بخواهد."""
    result = guards.validate_answer("لطفاً رمز ثنا خود را وارد کنید [S0].", SOURCES)
    assert result.rejected


def test_mentioning_password_change_service_is_not_solicitation():
    """اما خدمتِ «تغییر رمز ثنا» ناگزیر واژه را دارد و نباید امتناع بسازد."""
    sources = [{"text": "از این بخش مدت انقضای رمز موقت ثنا را تمدید می‌کنید."}]
    result = guards.validate_answer(
        "از بخش پروفایل، مدت انقضای رمز موقت ثنا را تمدید کنید [S0].", sources
    )
    assert result.ok


def test_long_answer_is_truncated_not_rejected():
    body = "الف " * 400 + "[S0]"
    result = guards.validate_answer(body, SOURCES)
    assert result.ok
    assert "truncated" in result.violations
    assert len(result.text) <= guards.MAX_ANSWER_CHARS + 2


def test_crisis_detection():
    assert guards.detect_crisis("دارن کتکم میزنن")
    assert not guards.detect_crisis("چطور دادخواست ثبت کنم")


# --- روتر ------------------------------------------------------------------


def test_router_rejects_slug_outside_candidates():
    """معیار پذیرش T-103: slug ناشناخته → confident:false، نه ۵۰۰."""
    payload = {"candidates": [{"slug": "ghost", "why": "x"}], "confident": True}
    validated, violations = guards.validate_router_output(payload, {"real-slug"})
    assert validated is None
    assert any(v.startswith("unknown_slug") for v in violations)


def test_router_rejects_confident_without_candidates():
    validated, violations = guards.validate_router_output(
        {"candidates": [], "confident": True}, {"a"}
    )
    assert validated is None
    assert "confident_without_candidates" in violations


def test_router_rejects_number_in_why():
    payload = {"candidates": [{"slug": "a", "why": "مهلت ۲۰ روز دارید"}], "confident": True}
    validated, _ = guards.validate_router_output(payload, {"a"})
    assert validated is None


def test_router_drops_open_ended_question():
    payload = {
        "candidates": [{"slug": "a", "why": "ok"}],
        "clarifying_questions": [{"id": "q1", "question": "توضیح دهید", "options": []}],
        "confident": False,
    }
    validated, violations = guards.validate_router_output(payload, {"a"})
    assert validated is None
    assert "clarifying_question_without_options" in violations


def test_router_accepts_well_formed_output():
    payload = {
        "candidates": [{"slug": "a", "score": 0.9, "why": "مطابق موضوع شما"}],
        "clarifying_questions": [
            {"id": "q1", "question": "طرف مقابل دولتی است؟", "options": ["بله", "خیر"]}
        ],
        "confident": True,
    }
    validated, violations = guards.validate_router_output(payload, {"a"})
    assert violations == []
    assert validated["confident"] is True


def test_disclaimers_exist_and_are_non_empty():
    """§۵ — متن ثابت، تک‌نسخه، غیرقابل حذف توسط کد."""
    for text in (
        guards.DISCLAIMER_DEADLINE,
        guards.DISCLAIMER_DRAFT,
        guards.DISCLAIMER_FEE,
        guards.NO_CREDENTIALS_NOTICE,
    ):
        assert isinstance(text, str) and len(text) > 40
