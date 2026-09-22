"""ارائه‌دهندهٔ آفلاین: امبدینگ هش‌شدهٔ کاراکتر-انگرام.

مدل نیست و ادعای معنایی ندارد؛ کارش این است که کل خط لوله — ایندکسر،
hybrid_search، ارزیابی، و تست‌ها — بدون هیچ فراخوانی شبکه‌ای قابل اجرا
باشد. در پرودکشن با یک مدل چندزبانهٔ ۱۰۲۴ بعدی جایگزین می‌شود و طبق T-102
این تعویض نباید هیچ کد فراخواننده‌ای را عوض کند.
"""

from __future__ import annotations

import hashlib
import math

from . import EmbeddingProvider


class HashingEmbeddingProvider(EmbeddingProvider):
    name = "hashing"

    def __init__(self, dim: int, ngram: int = 3) -> None:
        super().__init__(dim)
        self.ngram = ngram

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    def _embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        tokens = self._features(text or "")
        for token in tokens:
            digest = hashlib.blake2b(token.encode(), digest_size=8).digest()
            idx = int.from_bytes(digest[:4], "big") % self.dim
            sign = 1.0 if digest[4] & 1 else -1.0
            vec[idx] += sign
        norm = math.sqrt(sum(v * v for v in vec))
        if norm == 0.0:
            # بردار صفر با فاصلهٔ کسینوسی سازگار نیست؛ یک بعد ثابت می‌گذاریم.
            vec[0] = 1.0
            return vec
        return [v / norm for v in vec]

    def _features(self, text: str) -> list[str]:
        words = text.split()
        features = list(words)
        for word in words:
            padded = f" {word} "
            features += [padded[i : i + self.ngram] for i in range(len(padded) - self.ngram + 1)]
        return features
