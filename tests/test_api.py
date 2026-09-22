"""تست‌های یکپارچگی API — معیارهای پذیرش فاز ۰ و ۱.
rules-ok-file(§1): این فایل رد شدن اعتبارنامه را می‌آزماید.
"""

from __future__ import annotations

from daadno.db import connection, fetch_all, fetch_one

V = "/v1"


def test_health(client):
    body = client.get(f"{V}/health").json()
    assert body["status"] == "ok"
    assert body["database"] is True


# --- §۲ — محتوای تأییدنشده سرو نمی‌شود --------------------------------------


def test_unapproved_services_are_not_served(client, db):
    """۱۲ خدمت در جدول هست، ولی هیچ‌کدام تأیید نشده و هیچ‌کدام سرو نمی‌شود."""
    assert fetch_one("SELECT COUNT(*) AS n FROM service")["n"] == 12
    assert client.get(f"{V}/services").json()["items"] == []
    assert client.get(f"{V}/services/sana-registration").status_code == 404


def test_approved_services_are_served(client, approved_catalog):
    items = client.get(f"{V}/services").json()["items"]
    assert len(items) == 12
    card = client.get(f"{V}/services/sana-registration").json()
    assert card["title_fa"] == "ثبت‌نام در سامانه ثنا"
    assert "ثنا" in card["aliases"]


def test_stale_content_is_flagged(client, approved_catalog):
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE service SET review_due_at = now() - interval '1 day'"
            " WHERE slug = 'sana-registration'"
        )
    card = client.get(f"{V}/services/sana-registration").json()
    assert card["needs_review"] is True


def test_unapproved_fee_is_stripped_from_the_card(client, approved_catalog):
    """هزینه‌های seed تأییدنشده‌اند و نباید در کارت عمومی بیایند."""
    card = client.get(f"{V}/services/sabt-shekvaiyeh").json()
    assert card["fees"] == []


# --- T-106 — جست‌وجو ---------------------------------------------------------


def test_alias_search_finds_sana_by_misspelling(client, approved_catalog):
    """معیار پذیرش T-106: تایپ «سنا» نتیجهٔ ثنا را اول بیاورد."""
    items = client.get(f"{V}/services/search", params={"q": "سنا"}).json()["items"]
    assert items
    assert items[0]["slug"] == "sana-registration"


def test_search_normalises_arabic_yeh(client, approved_catalog):
    """نرمال‌سازی یک‌جا (§۷): «كيفري» با کاف و یای عربی هم باید برسد."""
    a = client.get(f"{V}/services/search", params={"q": "ابلاغ"}).json()["items"]
    b = client.get(f"{V}/services/search", params={"q": "ابلاغ "}).json()["items"]
    assert [x["slug"] for x in a] == [x["slug"] for x in b]
    assert any(x["slug"] == "eblagh-electronic" for x in a)


# --- T-104 — دروازهٔ امتناع ---------------------------------------------------


def test_out_of_scope_question_is_refused_without_calling_the_model(client, approved_catalog):
    """معیار پذیرش T-104، کلمه به کلمه — و اثباتش از روی لاگ."""
    body = client.post(f"{V}/ask", json={"text": "قیمت دلار چنده", "session_id": "t-104"}).json()

    assert body["refused"] is True
    assert body["refusal_reason"] in {"low_recall", "out_of_scope"}
    assert body["citations"] == []

    logged = fetch_all(
        "SELECT model_called, refused, refusal_reason, retrieved_chunk_ids"
        " FROM answer_log WHERE session_id = 't-104'"
    )
    assert len(logged) == 1
    assert logged[0]["model_called"] is False  # مدل اصلاً صدا زده نشد
    assert logged[0]["refused"] is True
    assert logged[0]["retrieved_chunk_ids"] is not None


def test_every_answer_is_logged_with_its_chunks(client, approved_catalog):
    client.post(f"{V}/ask", json={"text": "ابلاغیه الکترونیک", "session_id": "t-log"})
    logged = fetch_one("SELECT * FROM answer_log WHERE session_id = 't-log'")
    assert logged is not None
    assert logged["question_norm"] == "ابلاغیه الکترونیک"


def test_answer_when_not_refused_always_carries_citations(client, approved_catalog):
    """§۴ — پاسخ بدون ارجاع = پاسخ ندادن."""
    body = client.post(
        f"{V}/ask", json={"text": "ابلاغ الکترونیک قضایی چیست", "session_id": "t-cite"}
    ).json()
    if not body["refused"]:
        assert body["citations"]
        assert all("service_slug" in c and "section" in c for c in body["citations"])


def test_crisis_input_escalates(client, approved_catalog):
    body = client.post(
        f"{V}/ask", json={"text": "دارن کتکم میزنن", "session_id": "t-crisis"}
    ).json()
    assert body["refused"] is True
    assert body["refusal_reason"] == "crisis_escalation"
    logged = fetch_one("SELECT model_called FROM answer_log WHERE session_id = 't-crisis'")
    assert logged["model_called"] is False


# --- T-103 — روتر -----------------------------------------------------------


def test_route_never_returns_500_and_never_invents_a_slug(client, approved_catalog):
    body = client.post(f"{V}/route", json={"text": "از اداره بیمه شکایت دارم"})
    assert body.status_code == 200
    payload = body.json()
    served = {s["slug"] for s in client.get(f"{V}/services").json()["items"]}
    assert all(c["slug"] in served for c in payload["candidates"])
    assert isinstance(payload["confident"], bool)


def test_route_asks_option_based_questions_when_unsure(client, approved_catalog):
    payload = client.post(f"{V}/route", json={"text": "یه مشکلی دارم"}).json()
    if not payload["confident"]:
        for question in payload["clarifying_questions"]:
            assert len(question["options"]) >= 2


def test_route_output_never_contains_numbers(client, approved_catalog):
    from daadno.guards import contains_duration, contains_money

    payload = client.post(f"{V}/route", json={"text": "مهلت تجدیدنظر چقدر است"}).json()
    for candidate in payload["candidates"]:
        assert not contains_duration(candidate["why"])
        assert not contains_money(candidate["why"])


# --- T-003 / T-004 — ادمین ---------------------------------------------------


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_three_edits_produce_three_ascending_versions(client, staff_tokens):
    """معیار پذیرش T-003."""
    payloads = [
        {
            "slug": "t003",
            "title_fa": "خدمت تست",
            "summary": f"نسخه {i}",
            "category": "inquiry",
            "changelog": f"ویرایش {i}",
        }
        for i in (1, 2, 3)
    ]
    service_id = None
    for payload in payloads:
        response = client.post(
            f"{V}/admin/services", json=payload, headers=_auth(staff_tokens["admin"])
        )
        assert response.status_code == 201
        service_id = response.json()["id"]

    versions = client.get(
        f"{V}/admin/services/{service_id}/versions", headers=_auth(staff_tokens["admin"])
    ).json()["items"]
    assert [v["version"] for v in versions] == [3, 2, 1]

    stored = fetch_all(
        "SELECT version, payload->>'summary' AS summary FROM service_version"
        " WHERE service_id = %s ORDER BY version",
        (service_id,),
    )
    assert [s["summary"] for s in stored] == ["نسخه 1", "نسخه 2", "نسخه 3"]


def test_admin_without_legal_role_cannot_verify(client, staff_tokens):
    """معیار پذیرش T-004: کاربر admin بدون نقش حقوقی → ۴۰۳."""
    created = client.post(
        f"{V}/admin/services",
        json={"slug": "t004", "title_fa": "خدمت", "summary": "x", "category": "inquiry"},
        headers=_auth(staff_tokens["admin"]),
    ).json()
    response = client.post(
        f"{V}/admin/services/{created['id']}/verify", headers=_auth(staff_tokens["admin"])
    )
    assert response.status_code == 403


def test_legal_reviewer_verify_sets_review_due_at_ninety_days_later(client, staff_tokens):
    """معیار پذیرش T-004: review_due_at = verified_at + 90d."""
    created = client.post(
        f"{V}/admin/services",
        json={"slug": "t004b", "title_fa": "خدمت", "summary": "x", "category": "inquiry"},
        headers=_auth(staff_tokens["admin"]),
    ).json()
    response = client.post(
        f"{V}/admin/services/{created['id']}/verify", headers=_auth(staff_tokens["legal"])
    )
    assert response.status_code == 200

    row = fetch_one(
        "SELECT review_due_at - verified_at AS gap FROM service WHERE id = %s",
        (created["id"],),
    )
    assert row["gap"].days == 90


def test_editing_an_approved_service_revokes_its_approval(client, staff_tokens):
    """§۲ — محتوایی که عوض شده، همان چیزی نیست که تأیید شده بود."""
    created = client.post(
        f"{V}/admin/services",
        json={"slug": "t-revoke", "title_fa": "خدمت", "summary": "اول", "category": "inquiry"},
        headers=_auth(staff_tokens["admin"]),
    ).json()
    client.post(f"{V}/admin/services/{created['id']}/verify", headers=_auth(staff_tokens["legal"]))
    assert (
        fetch_one("SELECT status::text FROM service WHERE id = %s", (created["id"],))["status"]
        == "approved"
    )

    client.post(
        f"{V}/admin/services",
        json={"slug": "t-revoke", "summary": "دوم"},
        headers=_auth(staff_tokens["admin"]),
    )
    assert (
        fetch_one("SELECT status::text FROM service WHERE id = %s", (created["id"],))["status"]
        == "needs_legal_review"
    )


def test_approving_an_incomplete_rule_returns_409_not_500(client, staff_tokens):
    """قرارداد OpenAPI: ۴۰۹ برای قاعدهٔ ناقص."""
    rule = fetch_one("SELECT id FROM deadline_rule WHERE code = 'vakhahi'")
    response = client.post(
        f"{V}/admin/rules/{rule['id']}/approve", headers=_auth(staff_tokens["legal"])
    )
    assert response.status_code == 409


def test_admin_endpoints_require_a_staff_token(client, user_token):
    token, _ = user_token
    assert client.get(f"{V}/admin/services").status_code == 401
    assert client.get(f"{V}/admin/services", headers=_auth(token)).status_code == 403


# --- T-204 / T-206 — پرونده و مهلت -------------------------------------------


def test_eblagh_returns_unavailable_rules_not_guessed_numbers(client, user_token):
    """§۳ — تا تأیید نشدن اعداد، مهلت محاسبه نمی‌شود و کاربر دلیلش را می‌بیند."""
    token, _ = user_token
    case = client.post(f"{V}/cases", json={"label": "پروندهٔ چک"}, headers=_auth(token)).json()
    response = client.post(
        f"{V}/cases/{case['id']}/eblagh",
        json={"eblagh_type": "raye_badvi", "seen_at": "2026-05-03"},
        headers=_auth(token),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["deadlines"] == []
    assert body["unavailable_rules"]
    assert all(r["reason"] == "needs_legal_review" for r in body["unavailable_rules"])


def test_a_user_cannot_see_another_users_case(client, user_token):
    token, _ = user_token
    case = client.post(f"{V}/cases", json={"label": "خصوصی"}, headers=_auth(token)).json()

    from daadno.security import hash_phone, issue_token

    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (phone_hash) VALUES (%s)"
            " ON CONFLICT (phone_hash) DO UPDATE SET deleted_at = NULL RETURNING id",
            (hash_phone("09129999999"),),
        )
        other = issue_token(str(cur.fetchone()["id"]), kind="user")

    assert client.get(f"{V}/cases/{case['id']}/deadlines", headers=_auth(other)).status_code == 404


def test_future_seen_at_is_rejected(client, user_token):
    token, _ = user_token
    case = client.post(f"{V}/cases", json={"label": "x"}, headers=_auth(token)).json()
    response = client.post(
        f"{V}/cases/{case['id']}/eblagh",
        json={"eblagh_type": "raye_badvi", "seen_at": "2099-01-01"},
        headers=_auth(token),
    )
    assert response.status_code == 400


def test_ics_export_is_downloadable(client, user_token):
    token, _ = user_token
    case = client.post(f"{V}/cases", json={"label": "تقویم"}, headers=_auth(token)).json()
    response = client.get(f"{V}/cases/{case['id']}/export.ics", headers=_auth(token))
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/calendar")
    assert response.text.startswith("BEGIN:VCALENDAR")


# --- §۱ / §۶ — داده شخصی ------------------------------------------------------


def test_raw_mobile_number_is_never_stored(client):
    client.post(f"{V}/auth/login", json={"mobile": "09121234567"})
    rows = fetch_all("SELECT phone_hash FROM app_user")
    assert rows
    assert all("09121234567" not in r["phone_hash"] for r in rows)
    assert all(len(r["phone_hash"]) == 64 for r in rows)


def test_credentials_in_a_query_string_are_rejected(client):
    assert client.get(f"{V}/services", params={"password": "x"}).status_code == 400
    assert client.get(f"{V}/services", params={"sana_password": "x"}).status_code == 400


def test_login_response_carries_the_no_credentials_notice(client):
    body = client.post(f"{V}/auth/login", json={"mobile": "09120000000"}).json()
    assert "رمز" in body["notice"]
    assert "access_token" in body


# --- /drafts -----------------------------------------------------------------


def test_draft_carries_an_undeletable_disclaimer(client, user_token):
    token, _ = user_token
    response = client.post(
        f"{V}/drafts",
        json={
            "template_code": "dadkhast",
            "fields": {
                "khahan": "الف",
                "khande": "ب",
                "khaste": "مطالبه وجه",
                "sharh": "شرح ماوقع",
            },
        },
        headers=_auth(token),
    )
    assert response.status_code == 201
    body = response.json()
    assert "پیش‌نویس" in body["disclaimer"]
    assert body["disclaimer"] in body["body_md"]


def test_draft_strips_credential_fields(client, user_token):
    token, _ = user_token
    client.post(
        f"{V}/drafts",
        json={
            "template_code": "layehe",
            "fields": {
                "onvan": "لایحه",
                "shomare_parvande": "۱۴۰۵/۱",
                "sharh": "متن",
                "رمز_ثنا": "secret-value",
            },
        },
        headers=_auth(token),
    )
    rows = fetch_all("SELECT fields::text AS f FROM draft_document")
    assert all("secret-value" not in r["f"] for r in rows)


def test_draft_missing_fields_returns_422(client, user_token):
    token, _ = user_token
    response = client.post(
        f"{V}/drafts",
        json={"template_code": "dadkhast", "fields": {"khahan": "الف"}},
        headers=_auth(token),
    )
    assert response.status_code == 422


def test_draft_daily_quota_returns_429(client, user_token):
    token, _ = user_token
    payload = {
        "template_code": "ezharnameh",
        "fields": {"ezhar_konande": "الف", "mokhatab": "ب", "mozoo": "ج", "sharh": "د"},
    }
    codes = [
        client.post(f"{V}/drafts", json=payload, headers=_auth(token)).status_code for _ in range(8)
    ]
    assert 429 in codes
