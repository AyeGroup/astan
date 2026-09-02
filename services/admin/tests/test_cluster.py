"""The report a museum reads is only useful if the same question lands in
one row. These cases are the variance Persian speech actually produces."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cluster import cluster, fingerprint, stem, tokens   # noqa: E402


def same(a, b):
    return fingerprint(a) == fingerprint(b)


class TestMerging:
    def test_word_order_does_not_matter(self):
        # speech reorders freely; the same question arrives both ways
        assert same("چایخانه کجاست؟", "کجاست چایخانه")

    def test_zwnj_spelling_is_not_a_distinction(self):
        assert same("چای‌خانه کجاست", "چایخانه کجاست")

    def test_plural_suffix_folds(self):
        assert same("چایخانه‌ها کجا هستند؟", "چایخانه کجاست؟")

    def test_interrogative_variants_fold(self):
        assert same("قدمت این اثر چقدر است؟", "قدمت این اثر چند است؟")
        assert same("این اثر چیست", "این اثر چیه")
        assert same("موزه کجاست", "موزه کجا")

    def test_arabic_letters_fold(self):
        assert same("كتيبه كجاست", "کتیبه کجاست")

    def test_politeness_is_ignored(self):
        assert same("لطفا بگویید سرویس بهداشتی کجاست", "سرویس بهداشتی کجاست؟")


class TestNotMerging:
    """A wrong merge is worse than a missed one: the museum acts on this."""

    def test_different_interrogative_is_a_different_question(self):
        assert not same("قیمت بلیط چند است", "قیمت بلیط کجاست")
        assert not same("این اثر چیست", "این اثر کجاست")

    def test_different_subject_stays_apart(self):
        assert not same("چایخانه کجاست", "سرویس بهداشتی کجاست")

    def test_stemming_does_not_eat_short_words(self):
        # stripping "ی" off a three-letter word would collide with others
        assert stem("چای") == "چای"


class TestRanking:
    def test_counts_and_ranks(self):
        asked = ["چایخانه کجاست؟", "کجاست چای‌خانه", "چایخانه‌ها کجا هستند؟",
                 "قدمت این اثر چقدر است؟", "قدمت اثر چند است"]
        ranked = cluster(asked)
        assert ranked[0][1] == 3
        assert ranked[1][1] == 2

    def test_representative_is_something_a_visitor_actually_said(self):
        asked = ["کجاست چایخانه", "چایخانه کجاست؟"]
        rep, _, variants = cluster(asked)[0]
        assert rep in asked
        assert set(variants) == set(asked)

    def test_empty_and_noise_are_dropped(self):
        assert cluster(["", "   ", "؟؟؟"]) == []


class TestTokens:
    def test_question_mark_is_not_glued_to_the_word(self):
        # Persian punctuation lives in the Arabic block; treating that block
        # as word characters silently broke every grouping
        assert "کجا" in tokens("کجاست؟")
        assert all("؟" not in t for t in tokens("چایخانه کجاست؟"))

    def test_interrogatives_survive_stopword_removal(self):
        assert "چند" in tokens("قیمت بلیط چند است")
