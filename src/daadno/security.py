"""هویت، نقش‌ها، و حداقل‌سازی دادهٔ شخصی (ENGINEERING_RULES.md §۱ و §۶).

این ماژول عمداً هیچ تابعی برای ذخیره یا انتقال اعتبارنامهٔ سامانه‌های قوه
قضائیه ندارد و نباید پیدا کند. محصول رمز ثنا نمی‌گیرد — نه رمزنگاری‌شده،  rules-ok(§1): توضیح قاعده
نه موقت، نه در سشن.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import time
from typing import Any

import jwt

from .config import get_settings

ROLE_ADMIN = "admin"
ROLE_EDITOR = "editor"
ROLE_LEGAL_REVIEWER = "legal_reviewer"

_PBKDF2_ROUNDS = 260_000


def hash_phone(raw_mobile: str) -> str:
    """HMAC شمارهٔ موبایل. شمارهٔ خام هرگز ذخیره یا لاگ نمی‌شود."""
    digits = re.sub(r"\D", "", raw_mobile)
    if len(digits) < 10:
        raise ValueError("invalid mobile number")
    key = get_settings().phone_hmac_key.encode()
    return hmac.new(key, digits.encode(), hashlib.sha256).hexdigest()


def mask_national_id(value: str | None) -> str:
    """کد ملی در لاگ ماسک می‌شود؛ فقط چهار رقم آخر می‌ماند."""
    if not value:
        return ""
    digits = re.sub(r"\D", "", value)
    if len(digits) <= 4:
        return "*" * len(digits)
    return "*" * (len(digits) - 4) + digits[-4:]


def hash_password(password: str, *, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${_PBKDF2_ROUNDS}${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt, digest = stored.split("$")
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(rounds))
    return hmac.compare_digest(dk.hex(), digest)


def issue_token(subject: str, *, kind: str, roles: list[str] | None = None) -> str:
    s = get_settings()
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": subject,
        "kind": kind,  # user | staff
        "roles": roles or [],
        "iat": now,
        "exp": now + s.jwt_ttl_seconds,
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
