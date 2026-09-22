"""ورود کاربر و کارمند.

§۱ — هیچ اندپوینتی اینجا اعتبارنامهٔ سامانه دولتی نمی‌گیرد. ورود کاربر با
شماره موبایل خودِ اوست و تنها چیزی که ذخیره می‌شود HMAC آن شماره است.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import connection
from ..guards import NO_CREDENTIALS_NOTICE
from ..schemas import LoginRequest, StaffLoginRequest
from ..security import hash_phone, issue_token, verify_password

router = APIRouter(tags=["auth"])


@router.post("/auth/login")
def login(body: LoginRequest):
    """ورود کاربر نهایی.

    تأیید OTP کار درگاه پیامک است و در فاز ۰ شبیه‌سازی می‌شود؛ نکتهٔ ثابت این
    است که شمارهٔ خام از اینجا جلوتر نمی‌رود.
    """
    try:
        phone_hash = hash_phone(body.mobile)
    except ValueError as exc:
        raise HTTPException(400, "invalid mobile") from exc

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO app_user (phone_hash) VALUES (%s)
            ON CONFLICT (phone_hash) DO UPDATE SET deleted_at = NULL
            RETURNING id
            """,
            (phone_hash,),
        )
        user_id = str(cur.fetchone()["id"])

    return {
        "access_token": issue_token(user_id, kind="user"),
        "token_type": "bearer",
        "notice": NO_CREDENTIALS_NOTICE,
    }


@router.post("/auth/staff/login")
def staff_login(body: StaffLoginRequest):
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, password_hash, roles FROM staff_user" " WHERE email = %s AND is_active",
            (body.email,),
        )
        staff = cur.fetchone()
    if staff is None or not verify_password(body.password, staff["password_hash"]):
        raise HTTPException(401, "invalid credentials")
    return {
        "access_token": issue_token(str(staff["id"]), kind="staff", roles=staff["roles"]),
        "token_type": "bearer",
        "roles": staff["roles"],
    }
