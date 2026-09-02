"""Grouping visitor questions into the report a museum actually reads.

The deliverable is "the twenty questions most asked about this object".
Grouping raw strings does not produce it: «چایخانه کجاست؟» and
«کجاست چای‌خانه» are the same question and would land in two rows, so the
real top question is split into fragments and never surfaces.

Embeddings would solve it, but they add a model, a vector store and a
network hop to what is otherwise a small SQLite service. A morphological
fingerprint gets most of the way for Persian at no infrastructure cost:

    normalise -> drop function words -> strip suffixes -> sort -> join

Two deliberate choices in that pipeline:

  Interrogatives are kept. کجا, چند, چرا and چیست carry the whole
  intent — «قیمت چند است» and «قیمت کجاست» are different questions and
  must not merge.

  Stemming is suffix-only and conservative. Persian light stemming that
  chases prefixes starts merging unrelated words, and a wrong merge in
  this report is worse than a missed one: the museum acts on it.
"""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from typing import Dict, Iterable, List, Tuple

ZWNJ = "‌"

_FOLD = {"ي": "ی", "ى": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه", "ـ": ""}
_HARAKAT = re.compile("[ً-ٕٓ-ٰٟ]")

# Function words only. Nothing that changes what is being asked.
_STOPWORDS = {
    "از", "به", "با", "در", "که", "را", "این", "آن", "و", "یا", "هم", "هست",
    "است", "بود", "شد", "می", "برای", "تا", "بر", "های", "ها", "یک", "من",
    "شما", "ما", "او", "آیا", "لطفا", "لطفاً", "ببخشید", "سلام", "خب",
    "دارد", "دارند", "داره", "دارم", "کن", "کنم", "کنید", "بگو", "بگویید",
    "میشه", "می‌شه", "بشه", "الان", "حالا", "خیلی", "فقط", "دیگه", "دیگر",
    "هستند", "هستم", "هستید", "هستی", "هستن", "باشد", "باشند", "شود", "شوند",
    "کرد", "کند", "کنند", "دهد", "دهند", "آیا",
}

# Interrogatives are never dropped: they are the question. They are
# canonicalised instead, because speech produces every variant of each
# one and «کجاست» is «کجا» with the copula fused on.
_INTERROGATIVE = {
    "کجا": "کجا", "کجاست": "کجا", "کجان": "کجا", "کجاس": "کجا",
    "چیست": "چه", "چیه": "چه", "چه": "چه", "چی": "چه",
    "کیست": "کی", "کی": "کی",
    "چند": "چند", "چندتا": "چند", "چقدر": "چند",
    "چرا": "چرا",
    "چطور": "چطور", "چگونه": "چطور", "چجوری": "چطور",
    "کدام": "کدام", "کدوم": "کدام",
}

# Longest first, so "هایی" is stripped before "ی".
_SUFFIXES = [
    "هایی", "هایم", "هایت", "هایش", "هامان", "هاتان", "هاشان",
    "ترین", "های", "ها", "تر", "مان", "تان", "شان", "ام", "ات", "اش", "ی",
]

_MIN_STEM = 3
# \w already covers Persian letters. Naming the Arabic block here would
# also capture ؟ ، ؛ , which live in that block, and glue them onto words.
_TOKEN = re.compile(r"[^\w]+", re.UNICODE)


def normalize(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    text = "".join(_FOLD.get(ch, ch) for ch in text)
    text = _HARAKAT.sub("", text)
    # ZWNJ is a spelling choice, not a distinction: چای‌خانه == چایخانه
    text = text.replace(ZWNJ, "")
    text = re.sub(r"[۰-۹]", lambda m: str(ord(m.group()) - 0x06F0), text)
    return re.sub(r"\s+", " ", text).strip()


def stem(word: str) -> str:
    for suffix in _SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= _MIN_STEM:
            return word[: -len(suffix)]
    return word


def tokens(text: str) -> List[str]:
    out = []
    for raw in _TOKEN.split(normalize(text)):
        if not raw:
            continue
        if raw in _INTERROGATIVE:
            out.append(_INTERROGATIVE[raw])
            continue
        if raw in _STOPWORDS or len(raw) < 2:
            continue
        out.append(stem(raw))
    return out


def fingerprint(question: str) -> str:
    """A stable key for questions that mean the same thing.

    Order-independent, because Persian word order varies freely in
    speech and the same question arrives both ways.
    """
    unique = sorted(set(tokens(question)))
    return " ".join(unique)


def cluster(questions: Iterable[str]) -> List[Tuple[str, int, List[str]]]:
    """Group questions and rank by how often each was asked.

    Returns (representative, count, variants), where the representative is
    the shortest form actually spoken — a real visitor phrasing, never a
    reconstruction, so the report reads as something people said.
    """
    groups: Dict[str, List[str]] = defaultdict(list)
    for q in questions:
        key = fingerprint(q)
        if key:
            groups[key].append(q.strip())

    ranked = []
    for variants in groups.values():
        representative = min(variants, key=lambda s: (len(s), s))
        ranked.append((representative, len(variants), sorted(set(variants))))
    ranked.sort(key=lambda row: (-row[1], row[0]))
    return ranked
