"""لایهٔ انتزاع مدل زبانی.

مدل هرگز مستقیم صدا زده نمی‌شود: ``ask_service`` و ``router_service`` پیش از
فراخوانی دروازهٔ pre-flight را می‌گذرانند و پس از آن خروجی را در
``guards.py`` اعتبارسنجی می‌کنند.
"""

from __future__ import annotations

import abc
from functools import lru_cache


class LLMClient(abc.ABC):
    name: str = "abstract"

    @abc.abstractmethod
    def complete_json(self, system: str, user: str) -> dict:
        """خروجی JSON — برای پرامپت روتر."""

    @abc.abstractmethod
    def complete_text(self, system: str, user: str) -> str:
        """خروجی متنی — برای پرامپت پاسخ."""


@lru_cache
def get_client() -> LLMClient:
    from ..config import get_settings

    s = get_settings()
    if s.llm_provider == "heuristic":
        from .heuristic import HeuristicClient

        return HeuristicClient()
    if s.llm_provider == "anthropic":
        from .anthropic_client import AnthropicClient

        return AnthropicClient(
            api_key=s.llm_api_key or "",
            model=s.llm_model,
            timeout=s.llm_timeout_seconds,
        )
    raise ValueError(f"unknown llm provider: {s.llm_provider}")


__all__ = ["LLMClient", "get_client"]
