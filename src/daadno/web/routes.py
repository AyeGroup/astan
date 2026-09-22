"""رندر سمت سرور — T-005، T-106، T-107.

محتوای فارسی در خود HTML می‌آید (نه فقط از JS)، متادیتای SEO و JSON-LD نوع
``HowTo`` ساخته می‌شود، و صفحه بدون جاوااسکریپت هم کامل خوانده می‌شود.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.templating import Jinja2Templates

from .. import catalog, router_service
from ..guards import DISCLAIMER_FEE, NO_CREDENTIALS_NOTICE
from ..jalali import format_jalali_long

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

router = APIRouter(include_in_schema=False)

CATEGORY_LABELS = {
    "registration": "ثبت‌نام",
    "notification": "ابلاغ و اطلاع‌رسانی",
    "filing": "ثبت درخواست",
    "inquiry": "استعلام",
    "payment": "پرداخت",
    "appointment": "نوبت‌دهی",
}

CHANNEL_LABELS = {
    "self_service": "خودکاربری (اینترنتی)",
    "edmat_office": "دفتر خدمات الکترونیک قضایی",
    "judicial_unit": "مراجعه حضوری به واحد قضایی",
    "postal": "پستی",
}

PERSONA_LABELS = {
    "haqiqi": "شخص حقیقی",
    "hoquqi": "شخص حقوقی",
    "vakil": "وکیل",
    "karshenas": "کارشناس رسمی",
    "danesh_hoquqi": "دارندهٔ دانش حقوقی",
}

HOME_CHIPS = (
    "پیامک ابلاغیه آمده",
    "ثبت‌نام ثنا",
    "شکایت از اداره دولتی",
    "گواهی عدم سوءپیشینه",
    "ثبت دادخواست",
)


def _base_context(request: Request, **extra) -> dict:
    return {
        "request": request,
        "no_credentials_notice": NO_CREDENTIALS_NOTICE,
        "category_labels": CATEGORY_LABELS,
        "channel_labels": CHANNEL_LABELS,
        "persona_labels": PERSONA_LABELS,
        "fee_disclaimer": DISCLAIMER_FEE,
        **extra,
    }


@router.get("/", response_class=HTMLResponse)
def home(request: Request):
    services, _ = catalog.list_services(limit=9)
    return templates.TemplateResponse(
        "home.html",
        _base_context(request, services=services, chips=HOME_CHIPS, query=""),
    )


@router.get("/search", response_class=HTMLResponse)
def search(request: Request, q: str = ""):
    query = q.strip()
    if not query:
        return home(request)

    # اول تطبیق فوری روی عنوان و مترادف‌ها، بعد فالبک به /route (T-106).
    results = catalog.quick_search(query)
    route = None
    if len(results) < 3:
        route = router_service.route(query, session_id="web-search")

    return templates.TemplateResponse(
        "search.html",
        _base_context(request, query=query, results=results, route=route),
    )


@router.get("/services/{slug}", response_class=HTMLResponse)
def service_page(request: Request, slug: str):
    card = catalog.load_service_card(slug)
    if card is None:
        raise HTTPException(404, "service not found")
    public = catalog.public_card(card)
    verified = card.get("verified_at")

    return templates.TemplateResponse(
        "service.html",
        _base_context(
            request,
            card=public,
            verified_jalali=format_jalali_long(verified.date()) if verified else None,
            canonical=f"/services/{slug}",
            json_ld=json.dumps(build_json_ld(public), ensure_ascii=False),
        ),
    )


def build_json_ld(card: dict) -> dict:
    """‏JSON-LD نوع ``HowTo``.

    فقط گام‌هایی وارد می‌شوند که متن واقعی دارند: علامت‌گذاری ساختاریافته‌ای
    که به «TODO_CONTENT» اشاره کند، هم بی‌فایده است هم به اعتبار دامنه
    آسیب می‌زند.
    """
    steps = [
        {
            "@type": "HowToStep",
            "position": step["ord"],
            "name": step["title"],
            "text": step["body_md"],
        }
        for step in card.get("steps") or []
        if step.get("body_md") and "TODO_CONTENT" not in step["body_md"]
    ]

    data: dict = {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": card["title_fa"],
        "description": card["summary"],
        "inLanguage": "fa-IR",
    }
    if steps:
        data["step"] = steps
    supplies = [{"@type": "HowToSupply", "name": d["name"]} for d in card.get("documents") or []]
    if supplies:
        data["supply"] = supplies
    if card.get("faqs"):
        data["mainEntity"] = {
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": f["question"],
                    "acceptedAnswer": {"@type": "Answer", "text": f["answer_md"]},
                }
                for f in card["faqs"]
            ],
        }
    return data


@router.get("/robots.txt", response_class=PlainTextResponse)
def robots(request: Request):
    base = str(request.base_url).rstrip("/")
    return (
        "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /search\n"
        f"Sitemap: {base}/sitemap.xml\n"
    )


@router.get("/sitemap.xml")
def sitemap(request: Request):
    base = str(request.base_url).rstrip("/")
    services, _ = catalog.list_services(limit=100)
    urls = [f"<url><loc>{base}/</loc><changefreq>weekly</changefreq></url>"]
    for s in services:
        lastmod = f"<lastmod>{s['verified_at'].date()}</lastmod>" if s.get("verified_at") else ""
        urls.append(
            f"<url><loc>{base}/services/{s['slug']}</loc>{lastmod}"
            f"<changefreq>monthly</changefreq></url>"
        )
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n"
    )
    from fastapi.responses import Response

    return Response(content=body, media_type="application/xml")
