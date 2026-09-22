"""گاردریل‌های خروجی مدل — قواعد ۳، ۴ و ۵ ENGINEERING_RULES.md.

هر تابع اینجا «کد» است، نه «پرامپت». اعتماد به این‌که مدل قاعده را رعایت
می‌کند، جای اعتبارسنجی را نمی‌گیرد؛ پرامپت بهترین تلاش است و این فایل
دروازه.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# --------------------------------------------------------------------------
# متن‌های ثابت. §۵ می‌گوید این‌ها غیرقابل حذف توسط کد هستند، پس تنها یک
# نسخه از هرکدام وجود دارد و لایه‌های بالاتر فقط می‌توانند آن را ضمیمه کنند.
# --------------------------------------------------------------------------

DISCLAIMER_DEADLINE = (
    "این محاسبه راهنمای فرایندی است و مشاوره حقوقی نیست. مبدأ شمارش، تاریخ "
    "رؤیت ابلاغیه‌ای است که خودتان وارد کرده‌اید. پیش از هر اقدام، عدد را با "
    "وکیل یا واحد قضایی مربوط بررسی کنید."
)

DISCLAIMER_DRAFT = (
    "پیش‌نویس — پیش از ثبت بازبینی شود. این متن جایگزین تنظیم سند توسط وکیل "
    "نیست و محتوای آن بر اساس داده‌هایی است که خودتان وارد کرده‌اید."
)

DISCLAIMER_FEE = (
    "این برآورد بر اساس تعرفهٔ سال اعلام‌شده است و رقم قطعی نیست. مبلغ نهایی را "
    "درگاه رسمی محاسبه و پرداخت هزینه‌ها تعیین می‌کند."
)

NO_CREDENTIALS_NOTICE = (
    # rules-ok(§1): متن اطلاع‌رسانی به کاربر
    "دادنو هرگز رمز ثنا، رمز موقت یا هیچ اعتبارنامهٔ سامانه دولتی شما را " "نمی‌پرسد و ذخیره نمی‌کند."
)

# --------------------------------------------------------------------------
# الگوها
# --------------------------------------------------------------------------

#: عدد کنار واژه‌های مهلت — هر عدد مهلت فقط از موتور مواعد می‌آید (§۳).
DURATION_PATTERN = re.compile(r"[0-9۰-۹٠-٩]+\s*(?:روز|ماه|هفته|سال)")

#: مبلغ در متن تولیدی — ارقام هزینه از /fees/estimate می‌آیند، نه از مدل.
MONEY_PATTERN = re.compile(r"[0-9۰-۹٠-٩][0-9۰-۹٠-٩,،.]*\s*(?:ریال|تومان)")

#: ارجاع به مادهٔ قانونی در متن تولیدی.
ARTICLE_PATTERN = re.compile(r"ماده\s*[0-9۰-۹٠-٩]+")

#: ارجاع به منبع، به شکل [S0]، [S1] …
CITATION_PATTERN = re.compile(r"\[S(\d+)\]")

#: درخواستِ اعتبارنامه — نه هر اشاره‌ای به آن (§۱).
#:
#: خدمت «تغییر رمز ثنا» ناگزیر واژهٔ رمز را دارد و نقل متن آن تخلف نیست؛
#: چیزی که ممنوع است، *خواستن* رمز از کاربر است. پس الگو فعل درخواست را
#: هم می‌خواهد، نه فقط اسم را.
_CREDENTIAL_NOUN = (
    r"(?:رمز(?:\s*(?:عبور|موقت|ثنا))?|پسورد|password"  # rules-ok(§1): آشکارساز، نه ذخیره‌سازی
    r"|کلمه\s*عبور|کد\s*یکبار\s*مصرف)"
)
_REQUEST_VERB = r"(?:وارد\s*کنید|بفرستید|ارسال\s*کنید|بدهید|بنویسید|اعلام\s*کنید|در\s*اختیار)"
CREDENTIAL_SOLICITATION = re.compile(  # rules-ok(§1): آشکارساز، نه ذخیره‌سازی
    rf"{_CREDENTIAL_NOUN}[^\n.!؟]{{0,40}}{_REQUEST_VERB}"
    rf"|{_REQUEST_VERB}[^\n.!؟]{{0,40}}{_CREDENTIAL_NOUN}"
    rf"|{_CREDENTIAL_NOUN}\s*(?:خود|تان|ت)\s*را"
)

#: نشانه‌های بحران — پاسخ عادی داده نمی‌شود.
CRISIS_PATTERN = re.compile(
    r"(خودکشی|خودکشي|می\s*خوام\s*بمیرم|قصد\s*جان|تهدید\s*به\s*قتل|دارن\s*کتکم|"
    r"الان\s*داره\s*کتک|تجاوز\s*(?:داره|شده)|کودک\s*آزاری|گروگان)"
)

#: مشاوره حقوقی در برابر راهنمایی فرایندی (§۵).
LEGAL_ADVICE_PATTERN = re.compile(
    r"(حق\s*با\s*شماست|برنده\s*می\s*شوید|قطعا?ً?\s*(?:محکوم|تبرئه)|"
    r"رأی\s*به\s*نفع\s*شما|شانس\s*شما\s*(?:بالا|زیاد))"
)

MAX_ANSWER_CHARS = 1000

REFUSAL_LOW_RECALL = "low_recall"
REFUSAL_OUT_OF_SCOPE = "out_of_scope"
REFUSAL_NEEDS_HUMAN = "needs_human"
REFUSAL_CRISIS = "crisis_escalation"


@dataclass
class ValidationResult:
    """نتیجهٔ اعتبارسنجی post-flight."""

    ok: bool
    text: str
    violations: list[str] = field(default_factory=list)
    refusal_reason: str | None = None
    cited_indexes: list[int] = field(default_factory=list)

    @property
    def rejected(self) -> bool:
        return not self.ok


def contains_duration(text: str) -> bool:
    return bool(DURATION_PATTERN.search(text or ""))


def contains_money(text: str) -> bool:
    return bool(MONEY_PATTERN.search(text or ""))


def detect_crisis(text: str) -> bool:
    return bool(CRISIS_PATTERN.search(text or ""))


def cited_source_indexes(text: str) -> list[int]:
    return sorted({int(m.group(1)) for m in CITATION_PATTERN.finditer(text or "")})


def validate_router_output(payload: dict, allowed_slugs: set[str]) -> tuple[dict | None, list[str]]:
    """اعتبارسنجی خروجی پرامپت روتر — prompts/01_router.md.

    برمی‌گرداند (payload پاک‌شده یا None، فهرست تخلف‌ها). هر تخلف یعنی کل
    پاسخ دور ریخته می‌شود و سرویس ``confident: false`` برمی‌گرداند — نه ۵۰۰.
    """
    violations: list[str] = []

    if not isinstance(payload, dict):
        return None, ["not_an_object"]

    raw_candidates = payload.get("candidates")
    if not isinstance(raw_candidates, list):
        return None, ["candidates_not_a_list"]

    candidates = []
    for item in raw_candidates:
        if not isinstance(item, dict):
            violations.append("candidate_not_an_object")
            continue
        slug = item.get("slug")
        if slug not in allowed_slugs:
            # «خدمتی که در CANDIDATES نیست وجود ندارد.»
            violations.append(f"unknown_slug:{slug}")
            continue
        why = str(item.get("why") or "").strip()
        if contains_duration(why) or contains_money(why) or ARTICLE_PATTERN.search(why):
            violations.append(f"forbidden_number_in_why:{slug}")
            continue
        try:
            score = float(item.get("score") or 0.0)
        except (TypeError, ValueError):
            score = 0.0
        candidates.append({"slug": slug, "score": score, "why": why})

    questions = []
    for item in payload.get("clarifying_questions") or []:
        if not isinstance(item, dict):
            continue
        options = [str(o) for o in (item.get("options") or []) if str(o).strip()]
        question = str(item.get("question") or "").strip()
        if not question or len(options) < 2:
            # «هر پرسش باید گزینه‌دار باشد، نه تشریحی.»
            violations.append("clarifying_question_without_options")
            continue
        if contains_duration(question) or contains_money(question):
            violations.append("forbidden_number_in_question")
            continue
        questions.append(
            {
                "id": str(item.get("id") or f"q{len(questions) + 1}"),
                "question": question,
                "options": options[:6],
            }
        )

    confident = bool(payload.get("confident"))
    if confident and not candidates:
        violations.append("confident_without_candidates")
        confident = False

    if violations:
        return None, violations

    return (
        {
            "candidates": candidates[:5],
            "clarifying_questions": questions[:3],
            "confident": confident,
        },
        [],
    )


def validate_answer(text: str, sources: list[dict]) -> ValidationResult:
    """اعتبارسنجی post-flight پاسخ — prompts/02_answer.md.

    چهار بررسی، دقیقاً به همان ترتیب و با همان پیامد که در پرامپت آمده.
    """
    violations: list[str] = []
    body = (text or "").strip()

    if not body:
        return ValidationResult(False, "", ["empty_answer"], REFUSAL_LOW_RECALL)

    # ۱ — حداقل یک ارجاع [Sn] معتبر
    cited = [i for i in cited_source_indexes(body) if 0 <= i < len(sources)]
    if not cited:
        return ValidationResult(False, body, ["no_valid_citation"], REFUSAL_LOW_RECALL)

    # ۲ — هیچ عدد مهلتی در متن نباشد
    if contains_duration(body):
        violations.append("duration_in_answer")
        return ValidationResult(False, body, violations, REFUSAL_LOW_RECALL)

    # همان منطق برای مبلغ: ارقام هزینه از ماشین‌حساب می‌آیند، نه از مدل.
    if contains_money(body):
        violations.append("money_in_answer")
        return ValidationResult(False, body, violations, REFUSAL_LOW_RECALL)

    # ۳ — «ماده n» که در SOURCES نیامده: آن جمله حذف و هشدار لاگ می‌شود
    source_blob = " ".join(str(s.get("text") or "") for s in sources)
    known_articles = set(ARTICLE_PATTERN.findall(source_blob))
    if any(a not in known_articles for a in ARTICLE_PATTERN.findall(body)):
        body, dropped = _drop_sentences_with_unknown_article(body, known_articles)
        if dropped:
            violations.append("unsourced_article_dropped")
        cited = [i for i in cited_source_indexes(body) if 0 <= i < len(sources)]
        if not cited:
            return ValidationResult(
                False, body, [*violations, "no_valid_citation"], REFUSAL_LOW_RECALL
            )

    # §۱ — خروجی حق ندارد اعتبارنامه بخواهد
    if CREDENTIAL_SOLICITATION.search(body):
        violations.append("credential_solicitation")
        return ValidationResult(False, body, violations, REFUSAL_NEEDS_HUMAN)

    # §۵ — راهنمایی فرایندی، نه مشاوره حقوقی
    if LEGAL_ADVICE_PATTERN.search(body):
        violations.append("legal_advice")
        return ValidationResult(False, body, violations, REFUSAL_NEEDS_HUMAN)

    # ۴ — طول پاسخ < ۱۰۰۰ کاراکتر، با برش و هشدار
    if len(body) > MAX_ANSWER_CHARS:
        body = body[:MAX_ANSWER_CHARS].rstrip() + " …"
        violations.append("truncated")

    return ValidationResult(True, body, violations, None, cited)


def _drop_sentences_with_unknown_article(text: str, known_articles: set[str]) -> tuple[str, bool]:
    sentences = re.split(r"(?<=[.!؟\n])\s+", text)
    kept, dropped = [], False
    for sentence in sentences:
        found = ARTICLE_PATTERN.findall(sentence)
        if found and any(a not in known_articles for a in found):
            dropped = True
            continue
        kept.append(sentence)
    return " ".join(kept).strip(), dropped
