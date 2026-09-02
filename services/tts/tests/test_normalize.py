"""Each case here corresponds to a failure measured against the real
espeak-ng Persian phonemiser, not to an imagined one."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.normalize import is_speakable, normalize   # noqa: E402


class TestMarkdown:
    def test_bold_markers_removed(self):
        # espeak reads "**" aloud as "setare setare"
        assert normalize("**کاسهٔ صفوی** یک اثر است") == "کاسهٔ صفوی یک اثر است"

    def test_heading_markers_removed(self):
        # espeak reads "##" aloud as "hash hash"
        assert normalize("## دورهٔ صفوی\nاین اثر قدیمی است") == "دورهٔ صفوی این اثر قدیمی است"

    def test_bullets_removed(self):
        assert normalize("- مورد اول\n- مورد دوم") == "مورد اول مورد دوم"

    def test_link_keeps_label_drops_target(self):
        assert normalize("[کاتالوگ](https://example.com/a)") == "کاتالوگ"

    def test_fenced_code_removed(self):
        assert normalize("متن ```code here``` ادامه") == "متن ادامه"

    def test_inline_code_unwrapped(self):
        assert normalize("مقدار `۱۰` است") == "مقدار ۱۰ است"


class TestCitations:
    def test_numeric_citation_stripped(self):
        # "[۱]" inline is otherwise read as the number "one"
        assert normalize("این اثر صفوی است [۱] و لعاب دارد [۲].") == "این اثر صفوی است و لعاب دارد."

    def test_multi_number_citation_stripped(self):
        assert normalize("متن [۱، ۲] ادامه") == "متن ادامه"

    def test_non_numeric_brackets_kept(self):
        assert "کاسه" in normalize("این [کاسه] است")


class TestTimeAndDate:
    def test_time_becomes_words(self):
        # otherwise read as "nine colon thirty"
        assert normalize("ساعت 9:30 باز است") == "ساعت 9 و نیم باز است"

    def test_oclock_drops_zero_minutes(self):
        assert normalize("از 17:00 تعطیل است") == "از ساعت 17 تعطیل است"

    def test_arbitrary_minutes(self):
        assert normalize("قطار 8:45 حرکت می‌کند") == "قطار ساعت 8 و 45 دقیقه حرکت می‌کند"

    def test_invalid_time_left_alone(self):
        assert "99:99" in normalize("کد 99:99 است")

    def test_jalali_date(self):
        # otherwise "slash" is spoken between every field
        assert normalize("تاریخ ۱۴۰۳/۵/۲") == "تاریخ دوم مرداد 1403"

    def test_gregorian_date(self):
        assert normalize("در 2024/3/21 افتتاح شد") == "در بیست‌ویکم مارس 2024 افتتاح شد"

    def test_non_date_numbers_left_alone(self):
        assert normalize("قطعهٔ 12/5") == "قطعهٔ 12/5"


class TestNumbersLeftToEspeak:
    """espeak already reads Persian digits correctly, so we must not touch them."""

    def test_persian_digits_survive(self):
        assert normalize("این اثر ۴۰۰ سال قدمت دارد") == "این اثر ۴۰۰ سال قدمت دارد"

    def test_latin_digits_survive(self):
        assert normalize("۲۵ اثر و 30 سکه") == "۲۵ اثر و 30 سکه"

    def test_thousands_separator_survives(self):
        assert "1,200,000" in normalize("قیمت 1,200,000 ریال")


class TestCharacterFolding:
    def test_arabic_yeh_and_kaf_folded(self):
        assert normalize("كتاب يادگار") == "کتاب یادگار"

    def test_arabic_indic_digits_folded_to_persian(self):
        assert normalize("٤٠٠ سال") == "۴۰۰ سال"

    def test_diacritics_removed(self):
        assert normalize("مُوزهٔ مَلّی") == "موزهٔ ملی"

    def test_tatweel_removed(self):
        assert normalize("بســـیار زیبا") == "بسیار زیبا"

    def test_zwnj_preserved(self):
        # the phonemiser handles ZWNJ correctly; removing it would be a regression
        assert "‌" in normalize("می‌رود و لعاب‌دار است")


class TestNoise:
    def test_url_removed(self):
        assert normalize("به https://museum.example.com/a مراجعه کنید") == "به مراجعه کنید"

    def test_bare_domain_removed(self):
        assert normalize("سایت museum.example.com را ببینید") == "سایت را ببینید"

    def test_email_removed(self):
        assert normalize("به info@museum.ir ایمیل بزنید") == "به ایمیل بزنید"

    def test_emoji_removed(self):
        assert normalize("سلام 😀 خوش آمدید") == "سلام خوش آمدید"

    def test_repeated_terminators_collapsed(self):
        assert normalize("واقعا؟؟؟ بله!!!") == "واقعا؟ بله!"

    def test_quotes_removed(self):
        assert normalize("«کاسهٔ صفوی»") == "کاسهٔ صفوی"


class TestSymbols:
    def test_ampersand(self):
        assert normalize("الف & ب") == "الف و ب"

    def test_celsius(self):
        assert normalize("دما 25°C است") == "دما 25 درجهٔ سانتی‌گراد است"

    def test_percent(self):
        assert normalize("25% تخفیف") == "25 درصد تخفیف"

    def test_dimensions(self):
        assert normalize("ابعاد 30x40 سانتی‌متر") == "ابعاد 30 در 40 سانتی‌متر"


class TestContract:
    def test_idempotent(self):
        raw = "## **کاسهٔ صفوی** [۱]\nساعت 9:30 در تاریخ ۱۴۰۳/۵/۲ 😀"
        once = normalize(raw)
        assert normalize(once) == once, "normalisation must be stable, it is part of the cache key"

    def test_empty_input(self):
        assert normalize("") == ""
        assert normalize(None or "") == ""

    def test_truncation_breaks_on_a_word(self):
        out = normalize("کلمه " * 500, max_chars=100)
        assert len(out) <= 100
        assert not out.endswith("کلم")

    def test_is_speakable(self):
        assert is_speakable("سلام")
        assert not is_speakable("!!! ???")
        assert not is_speakable("")
