"""مدل‌های ورودی/خروجی — مطابق api/openapi.yaml."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Persona = Literal["haqiqi", "hoquqi", "vakil", "karshenas", "danesh_hoquqi"]
Residency = Literal["inside_iran", "outside_iran"]
TemplateCode = Literal["shekvaiyeh", "dadkhast", "layehe", "ezharnameh"]


class RouteRequest(BaseModel):
    text: str = Field(max_length=2000)
    persona: Persona | None = None
    answers: dict[str, str] | None = None
    session_id: str = "anonymous"


class AskRequest(BaseModel):
    text: str = Field(max_length=2000)
    session_id: str
    persona: Persona | None = None


class CaseCreate(BaseModel):
    label: str = Field(max_length=120)
    case_number: str | None = None
    court_name: str | None = None


class EblaghCreate(BaseModel):
    eblagh_type: str
    seen_at: str  # ISO date — تبدیل جلالی در کلاینت
    residency: Residency = "inside_iran"
    note: str | None = None


class DraftCreate(BaseModel):
    template_code: TemplateCode
    case_id: str | None = None
    fields: dict


class LoginRequest(BaseModel):
    """ورود کاربر با شماره موبایل.

    §۶ — شماره فقط برای ساخت HMAC استفاده می‌شود و خام ذخیره یا لاگ نمی‌شود.
    §۱ — هیچ فیلدی برای رمز سامانه‌های دولتی اینجا نیست و نباید اضافه شود.
    """

    mobile: str
    otp: str | None = None


class StaffLoginRequest(BaseModel):
    email: str
    password: str
