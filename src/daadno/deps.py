"""وابستگی‌های مشترک FastAPI — احراز هویت و نقش‌ها."""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status

from .security import ROLE_LEGAL_REVIEWER, decode_token


def _token(authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    try:
        return decode_token(authorization.split(" ", 1)[1].strip())
    except Exception as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from exc


def current_user(authorization: str | None = Header(default=None)) -> dict:
    claims = _token(authorization)
    if claims.get("kind") != "user":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "user token required")
    return claims


def current_staff(authorization: str | None = Header(default=None)) -> dict:
    claims = _token(authorization)
    if claims.get("kind") != "staff":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "staff token required")
    return claims


def require_role(role: str):
    def dependency(staff: dict = Depends(current_staff)) -> dict:
        if role not in (staff.get("roles") or []):
            # §۲ — تأیید فقط با نقش legal_reviewer، نه admin عمومی.
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"role '{role}' required")
        return staff

    return dependency


require_legal_reviewer = require_role(ROLE_LEGAL_REVIEWER)


def optional_user(authorization: str | None = Header(default=None)) -> dict | None:
    if not authorization:
        return None
    try:
        claims = _token(authorization)
    except HTTPException:
        return None
    return claims if claims.get("kind") == "user" else None
