"""رندر سمت سرور — T-005 و T-107.
rules-ok-file(§1): این فایل متن اطلاع‌رسانی «رمز نمی‌خواهیم» را می‌آزماید.
"""

from __future__ import annotations

import json
import re

import pytest

from daadno.web.routes import build_json_ld


@pytest.fixture
def page(client, approved_catalog):
    return client.get("/services/eblagh-electronic")


def test_persian_content_is_in_the_html_not_only_in_js(page):
    """معیار پذیرش T-005: view-source باید محتوای فارسی داشته باشد."""
    assert page.status_code == 200
    body = page.text
    assert "ابلاغ الکترونیک قضایی" in body
    assert "لحظهٔ رؤیت ابلاغیه" in body


def test_document_is_rtl_and_persian(page):
    assert '<html lang="fa" dir="rtl">' in page.text


def test_seo_metadata_is_present(page):
    body = page.text
    assert re.search(r'<meta name="description" content="[^"]{40,}"', body)
    assert '<link rel="canonical"' in body
    assert 'property="og:title"' in body


def test_json_ld_is_valid_howto(page):
    match = re.search(r'<script type="application/ld\+json">(.*?)</script>', page.text, re.DOTALL)
    assert match
    data = json.loads(match.group(1))
    assert data["@type"] == "HowTo"
    assert data["inLanguage"] == "fa-IR"
    assert data["name"]


def test_json_ld_skips_placeholder_steps():
    """علامت‌گذاری ساختاریافته‌ای که به TODO_CONTENT اشاره کند، به دامنه آسیب می‌زند."""
    data = build_json_ld(
        {
            "title_fa": "خدمت",
            "summary": "خلاصه",
            "steps": [
                {"ord": 1, "title": "الف", "body_md": "TODO_CONTENT"},
                {"ord": 2, "title": "ب", "body_md": "متن واقعی"},
            ],
            "documents": [],
        }
    )
    assert len(data["step"]) == 1
    assert data["step"][0]["name"] == "ب"


def test_deadline_number_never_appears_on_a_service_page(page):
    """§۳ — صفحهٔ خدمت به موتور مواعد لینک می‌دهد، عدد نمی‌نویسد."""
    from daadno.guards import DURATION_PATTERN

    body = re.sub(r"<script.*?</script>", "", page.text, flags=re.DOTALL)
    assert not DURATION_PATTERN.search(body)


def test_step_wizard_progress_is_client_side_only(client, approved_catalog):
    script = client.get("/static/steps.js")
    assert script.status_code == 200
    assert "localStorage" in script.text
    # پیشرفت نباید به سرور فرستاده شود (§۶).
    assert "fetch(" not in script.text
    assert "XMLHttpRequest" not in script.text


def test_home_page_renders_without_javascript(client, approved_catalog):
    body = client.get("/").text
    assert "چه کاری در سامانه‌های قضایی دارید؟" in body
    assert 'action="/search"' in body


def test_home_shows_nothing_when_nothing_is_approved(client, db):
    body = client.get("/").text
    assert "هنوز هیچ خدمتی تأیید حقوقی نگرفته" in body


def test_search_page_falls_back_to_routing(client, approved_catalog):
    body = client.get("/search", params={"q": "یه مشکل مبهم دارم"}).text
    assert "نتایج برای" in body


def test_no_credentials_notice_is_on_every_page(client, approved_catalog):
    for path in ("/", "/search?q=ثنا", "/services/sana-registration"):
        assert "هرگز رمز ثنا" in client.get(path).text


def test_robots_and_sitemap(client, approved_catalog):
    robots = client.get("/robots.txt")
    assert "Sitemap:" in robots.text
    assert "Disallow: /admin" in robots.text

    sitemap = client.get("/sitemap.xml")
    assert sitemap.status_code == 200
    assert "<urlset" in sitemap.text
    assert "/services/sana-registration" in sitemap.text


def test_unapproved_service_page_is_404(client, db):
    assert client.get("/services/sana-registration").status_code == 404
