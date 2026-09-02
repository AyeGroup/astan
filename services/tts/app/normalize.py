"""Persian text normalisation for speech synthesis.

Every rule here targets a failure observed in espeak-ng's Persian
phonemiser, not a hypothetical one. What espeak already does well is
deliberately left alone.

Notably absent: a number-to-words converter. espeak reads Persian,
Latin and Arabic-Indic digits correctly on its own (۴۰۰ -> chahârsâd),
so rewriting them here would only add a second, worse implementation.

What is present, and why:

  markdown        RAG answers routinely contain ** and ##, which espeak
                  reads aloud as "setâre setâre" and "hash hash".
  citations       "[1]" inside a sentence is read as the number "one",
                  corrupting the sentence around it.
  time and date   "9:30" becomes "nine colon thirty"; "1403/5/2" gets a
                  spoken "slash" between every field.
  urls            a URL is read character-salad and is useless aloud.
  emoji           read out by name, e.g. a smiley becomes "khande".
"""

from __future__ import annotations

import re
import unicodedata

ZWNJ = "‌"

# Arabic forms that appear constantly in Persian text copied from the web.
_CHAR_FOLD = {
    "ي": "ی",  # Arabic yeh -> Persian yeh
    "ى": "ی",  # alef maksura
    "ك": "ک",  # Arabic kaf -> Persian keheh
    "ۀ": "هٔ",  # heh with yeh above -> heh + hamza
    "ة": "ه",  # teh marbuta -> heh
    "‏": "",        # RLM
    "‎": "",        # LRM
    "﻿": "",
    "ـ": "",        # tatweel
    " ": " ",
}

# Arabic-Indic and extended Arabic-Indic digits -> Persian digits.
_DIGIT_FOLD = {chr(0x0660 + i): chr(0x06F0 + i) for i in range(10)}

# Combining harakat. Kept out of the text because the voices are trained
# on undiacritised Persian; leaving them in shifts the phonemisation.
# U+0654 (hamza above) is deliberately excluded: in "هٔ" it is the ezafe
# marker, and dropping it turns "موزهٔ ملی" into "موزه ملی", which the
# phonemiser then reads as two unlinked words instead of an ezafe pair.
_HARAKAT = re.compile("[\u064B-\u0653\u0655-\u065F\u0670]")

_EMOJI = re.compile(
    "[" "\U0001f300-\U0001faff" "\U00002700-\U000027bf"
    "\U0001f1e6-\U0001f1ff" "☀-⛿" "️" "←-⇿" "]",
    flags=re.UNICODE,
)

_URL = re.compile(r"\b(?:https?://|www\.)\S+|\b[\w.+-]+@[\w-]+\.[\w.]+\b", re.I)
_BARE_DOMAIN = re.compile(r"\b[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|ir|io|dev|co)\b", re.I)

# Only purely numeric brackets are citations. "[کاسه]" stays.
_CITATION = re.compile(r"[\[\(]\s*[\d۰-۹٠-٩]+(?:\s*[,،\-–]\s*[\d۰-۹٠-٩]+)*\s*[\]\)]")

_JALALI_MONTHS = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
]
_GREGORIAN_MONTHS = [
    "ژانویه", "فوریه", "مارس", "آوریل", "مه", "ژوئن",
    "ژوئیه", "اوت", "سپتامبر", "اکتبر", "نوامبر", "دسامبر",
]
_DAY_ORDINALS = [
    "", "اول", "دوم", "سوم", "چهارم", "پنجم", "ششم", "هفتم", "هشتم", "نهم", "دهم",
    "یازدهم", "دوازدهم", "سیزدهم", "چهاردهم", "پانزدهم", "شانزدهم", "هفدهم",
    "هجدهم", "نوزدهم", "بیستم", "بیست‌ویکم", "بیست‌ودوم", "بیست‌وسوم",
    "بیست‌وچهارم", "بیست‌وپنجم", "بیست‌وششم", "بیست‌وهفتم", "بیست‌وهشتم",
    "بیست‌ونهم", "سی‌ام", "سی‌ویکم",
]

_SYMBOLS = [
    (re.compile(r"\s*&\s*"), " و "),
    (re.compile(r"(\d)\s*°\s*[cC]\b"), r"\1 درجهٔ سانتی‌گراد"),
    (re.compile(r"(\d)\s*°\s*[fF]\b"), r"\1 درجهٔ فارنهایت"),
    (re.compile(r"(\d)\s*°"), r"\1 درجه"),
    (re.compile(r"\s*%"), " درصد"),
    (re.compile(r"(\d)\s*[x×]\s*(\d)"), r"\1 در \2"),
]


def _fold_chars(text: str) -> str:
    out = []
    for ch in text:
        out.append(_CHAR_FOLD.get(ch, _DIGIT_FOLD.get(ch, ch)))
    return "".join(out)


def _strip_markdown(text: str) -> str:
    text = re.sub(r"```.*?```", " ", text, flags=re.S)          # fenced code
    text = re.sub(r"`([^`]*)`", r"\1", text)                     # inline code
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)            # images
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)         # links keep label
    text = re.sub(r"(\*\*|__)(.+?)\1", r"\2", text, flags=re.S)  # bold
    text = re.sub(r"(?<!\w)([*_])(?!\s)(.+?)(?<!\s)\1(?!\w)", r"\2", text, flags=re.S)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.M)    # headings
    text = re.sub(r"^\s{0,3}>\s?", "", text, flags=re.M)         # block quotes
    text = re.sub(r"^\s*[-*+•]\s+", "", text, flags=re.M)   # bullets
    text = re.sub(r"^\s*\|.*\|\s*$", " ", text, flags=re.M)      # table rows
    text = re.sub(r"^\s*[-=]{3,}\s*$", " ", text, flags=re.M)    # rules
    return text


def _to_ascii_digits(s: str) -> str:
    out = []
    for ch in s:
        if "۰" <= ch <= "۹":
            out.append(chr(ord("0") + ord(ch) - 0x06F0))
        elif "٠" <= ch <= "٩":
            out.append(chr(ord("0") + ord(ch) - 0x0660))
        else:
            out.append(ch)
    return "".join(out)


_TIME = re.compile(r"(?<![\d:])([۰-۹0-9]{1,2}):([۰-۹0-9]{2})(?::([۰-۹0-9]{2}))?(?![\d:])")


def _expand_time(text: str) -> str:
    def repl(m):
        h = int(_to_ascii_digits(m.group(1)))
        mi = int(_to_ascii_digits(m.group(2)))
        if h > 23 or mi > 59:
            return m.group(0)
        # "ساعت 9:30" must not become "ساعت ساعت 9 و نیم"
        preceding = m.string[max(0, m.start() - 8):m.start()]
        lead = "" if "ساعت" in preceding else "ساعت "
        if mi == 0:
            return f"{lead}{h}"
        if mi == 30:
            return f"{lead}{h} و نیم"
        return f"{lead}{h} و {mi} دقیقه"
    return _TIME.sub(repl, text)


_DATE = re.compile(r"(?<![\d/])([۰-۹0-9]{4})[/\-]([۰-۹0-9]{1,2})[/\-]([۰-۹0-9]{1,2})(?![\d/])")


def _expand_date(text: str) -> str:
    def repl(m):
        y, mo, d = (int(_to_ascii_digits(g)) for g in m.groups())
        if not (1 <= mo <= 12 and 1 <= d <= 31):
            return m.group(0)
        if 1200 <= y <= 1500:
            month = _JALALI_MONTHS[mo - 1]
        elif 1700 <= y <= 2200:
            month = _GREGORIAN_MONTHS[mo - 1]
        else:
            return m.group(0)
        return f"{_DAY_ORDINALS[d]} {month} {y}"
    return _DATE.sub(repl, text)


def normalize(text: str, *, max_chars: int = 2000) -> str:
    """Normalise one utterance for the phonemiser.

    Idempotent: normalising an already-normalised string is a no-op, which
    matters because the result is used as part of the cache key.
    """
    if not text:
        return ""

    text = unicodedata.normalize("NFC", text)
    text = _fold_chars(text)
    text = _HARAKAT.sub("", text)
    text = _strip_markdown(text)
    text = _CITATION.sub(" ", text)
    text = _URL.sub(" ", text)
    text = _BARE_DOMAIN.sub(" ", text)
    text = _EMOJI.sub(" ", text)

    text = _expand_date(text)
    text = _expand_time(text)
    for pattern, repl in _SYMBOLS:
        text = pattern.sub(repl, text)

    # Repeated terminators carry no extra prosody but do add pauses.
    text = re.sub(r"([.!?؟؛])\1+", r"\1", text)
    text = re.sub(r"[«»\"'`]", " ", text)      # quotes add nothing aloud
    text = re.sub(r"[ \t​]+", " ", text)
    text = re.sub(r"\s*\n\s*", " ", text)
    text = re.sub(r" ([.,،؛!؟:])", r"\1", text)
    text = re.sub(r"\s{2,}", " ", text).strip()

    if len(text) > max_chars:
        cut = text.rfind(" ", 0, max_chars)
        text = text[: cut if cut > max_chars * 0.6 else max_chars].rstrip()

    return text


def is_speakable(text: str) -> bool:
    """True when anything is left worth synthesising."""
    return bool(re.search(r"[\w؀-ۿ]", text or ""))
