"""نردبان یادآوری — T-205."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from daadno import reminders


def test_twenty_day_deadline_schedules_exactly_five_reminders():
    """معیار پذیرش T-205، بند اول."""
    planned = reminders.plan_ladder(date(2026, 5, 4), date(2026, 5, 24))
    assert len(planned) == 5
    assert [p.channel for p in planned] == ["push", "push", "push", "sms", "sms"]
    assert planned[-1].fire_at.date() <= date(2026, 5, 24)


def test_ladder_is_chronological_and_within_window():
    planned = reminders.plan_ladder(date(2026, 5, 4), date(2026, 5, 24))
    times = [p.fire_at for p in planned]
    assert times == sorted(times)
    assert all(date(2026, 5, 4) <= p.fire_at.date() <= date(2026, 5, 24) for p in planned)


def test_short_deadline_drops_impossible_rungs():
    """مهلت دو روزه جا برای پلهٔ T-5d ندارد و نباید یادآور گذشته بسازد."""
    planned = reminders.plan_ladder(date(2026, 5, 4), date(2026, 5, 6))
    assert planned
    assert all(p.fire_at.date() >= date(2026, 5, 4) for p in planned)


def test_same_day_same_channel_is_not_duplicated():
    planned = reminders.plan_ladder(date(2026, 5, 4), date(2026, 5, 5))
    keys = [(p.fire_at, p.channel) for p in planned]
    assert len(keys) == len(set(keys))


class _RecordingNotifier(reminders.Notifier):
    def __init__(self):
        self.sent = []

    def send(self, channel, recipient_hash, payload):
        self.sent.append((channel, recipient_hash, payload))


def _case_with_deadline(expires_in_days: int = 20):
    """یک پرونده، یک ابلاغ و یک نمونهٔ مهلت — مستقیم در دیتابیس."""
    import json

    from daadno.db import connection
    from daadno.security import hash_phone

    seen_at = date.today()
    expires = seen_at + timedelta(days=expires_in_days)
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO app_user (phone_hash) VALUES (%s)"
            " ON CONFLICT (phone_hash) DO UPDATE SET deleted_at = NULL RETURNING id",
            (hash_phone(f"0912000{expires_in_days:04d}"),),
        )
        user_id = cur.fetchone()["id"]
        cur.execute(
            "INSERT INTO user_case (user_id, label) VALUES (%s, 'پروندهٔ تست') RETURNING id",
            (user_id,),
        )
        case_id = cur.fetchone()["id"]
        cur.execute("SELECT id FROM eblagh_type WHERE code = 'raye_badvi'")
        type_id = cur.fetchone()["id"]
        cur.execute(
            "INSERT INTO eblagh_event (case_id, eblagh_type_id, seen_at)"
            " VALUES (%s, %s, %s) RETURNING id",
            (case_id, type_id, seen_at),
        )
        event_id = cur.fetchone()["id"]
        cur.execute("SELECT id FROM deadline_rule WHERE code = 'vakhahi'")
        rule_id = cur.fetchone()["id"]
        cur.execute(
            "INSERT INTO deadline_instance (eblagh_event_id, rule_id, rule_snapshot,"
            " expires_on) VALUES (%s, %s, %s, %s) RETURNING id",
            (event_id, rule_id, json.dumps({"code": "vakhahi"}), expires),
        )
        return str(cur.fetchone()["id"]), case_id


def test_worker_is_idempotent(db):
    """معیار پذیرش T-205، بند دوم: اجرای دوباره پیام تکراری نمی‌فرستد."""
    instance_id, _ = _case_with_deadline(20)
    assert reminders.schedule_ladder(instance_id, computed_on=date.today()) == 5

    later = datetime.now(UTC) + timedelta(days=30)
    notifier = _RecordingNotifier()
    first = reminders.run_worker(now=later, notifier=notifier)
    assert first["sent"] == 5
    assert len(notifier.sent) == 5

    second_notifier = _RecordingNotifier()
    second = reminders.run_worker(now=later, notifier=second_notifier)
    assert second["sent"] == 0
    assert second_notifier.sent == []


def test_scheduling_twice_does_not_duplicate_rows(db):
    instance_id, _ = _case_with_deadline(21)
    reminders.schedule_ladder(instance_id, computed_on=date.today())
    reminders.schedule_ladder(instance_id, computed_on=date.today())

    from daadno.db import fetch_one

    row = fetch_one(
        "SELECT COUNT(*) AS n FROM reminder WHERE deadline_instance_id = %s", (instance_id,)
    )
    assert row["n"] == 5


def test_sms_body_carries_no_sensitive_content(db):
    """متن پیامک نباید شماره پرونده یا نوع ابلاغ را لو بدهد."""
    instance_id, _ = _case_with_deadline(22)
    reminders.schedule_ladder(instance_id, computed_on=date.today())
    notifier = _RecordingNotifier()
    reminders.run_worker(now=datetime.now(UTC) + timedelta(days=40), notifier=notifier)
    for channel, _, payload in notifier.sent:
        if channel != "sms":
            continue
        assert "پرونده" not in payload["body"] or "حساب" in payload["body"]
        assert "رأی" not in payload["body"]
        assert "واخواهی" not in payload["body"]
