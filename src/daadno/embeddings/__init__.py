"""لایهٔ انتزاع امبدینگ — T-102.

تعویض ارائه‌دهنده با متغیر محیطی ``DAADNO_EMBEDDING_PROVIDER`` انجام می‌شود و
هیچ کد فراخواننده‌ای تغییر نمی‌کند.
"""

from __future__ import annotations

import abc
from functools import lru_cache


class EmbeddingProvider(abc.ABC):
    """قرارداد هر ارائه‌دهندهٔ امبدینگ."""

    name: str = "abstract"

    def __init__(self, dim: int) -> None:
        self.dim = dim

    @abc.abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]:
        """بردار هر متن، به همان ترتیب ورودی."""

    def embed_one(self, text: str) -> list[float]:
        return self.embed([text])[0]


@lru_cache
def get_provider() -> EmbeddingProvider:
    from ..config import get_settings

    s = get_settings()
    if s.embedding_provider == "hashing":
        from .hashing import HashingEmbeddingProvider

        return HashingEmbeddingProvider(s.embedding_dim)
    if s.embedding_provider == "openai_compatible":
        from .openai_compatible import OpenAICompatibleProvider

        return OpenAICompatibleProvider(
            dim=s.embedding_dim,
            api_base=s.embedding_api_base or "https://api.openai.com/v1",
            api_key=s.embedding_api_key or "",
            model=s.embedding_model,
        )
    raise ValueError(f"unknown embedding provider: {s.embedding_provider}")


__all__ = ["EmbeddingProvider", "get_provider"]
