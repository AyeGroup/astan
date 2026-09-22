"""ارائه‌دهندهٔ Anthropic Messages API."""

from __future__ import annotations

import json
import re

import httpx

from . import LLMClient

_ANTHROPIC_VERSION = "2023-06-01"


class AnthropicClient(LLMClient):
    name = "anthropic"

    def __init__(self, api_key: str, model: str, timeout: float = 20.0) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def complete_json(self, system: str, user: str) -> dict:
        raw = self._call(system, user, max_tokens=1024)
        return _extract_json(raw)

    def complete_text(self, system: str, user: str) -> str:
        return self._call(system, user, max_tokens=800)

    def _call(self, system: str, user: str, *, max_tokens: int) -> str:
        response = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": _ANTHROPIC_VERSION,
                "content-type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": max_tokens,
                "temperature": 0,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
            timeout=self.timeout,
        )
        response.raise_for_status()
        blocks = response.json().get("content", [])
        return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")


def _extract_json(raw: str) -> dict:
    """پرامپت می‌گوید «فقط JSON»؛ این تابع فرض نمی‌کند مدل گوش داده است."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except json.JSONDecodeError:
            pass
    braced = re.search(r"\{.*\}", raw, re.DOTALL)
    if braced:
        try:
            return json.loads(braced.group(0))
        except json.JSONDecodeError:
            pass
    # خروجی نامعتبر یعنی «مطمئن نیستیم»، نه ۵۰۰.
    return {}
