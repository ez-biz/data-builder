"""Tests for notification_service — webhook dispatching and HMAC signing.

urllib is mocked so no real HTTP requests leave the test.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest

from app.services import notification_service


class _RecordingExecutor:
    def __init__(self):
        self.submissions: list[tuple] = []

    def submit(self, fn, *args, **kwargs):
        self.submissions.append((fn, args, kwargs))
        return None


@pytest.fixture
def recorder(monkeypatch):
    rec = _RecordingExecutor()
    monkeypatch.setattr(notification_service, "_executor", rec)
    return rec


@pytest.fixture
def fake_urlopen(monkeypatch):
    """Replace urlopen with a recorder that captures the Request object."""
    calls: list = []

    @contextmanager
    def _cm(req, timeout=10):
        calls.append({
            "url": req.full_url,
            "headers": dict(req.headers),
            "data": req.data,
            "method": req.get_method(),
        })
        resp = MagicMock()
        resp.status = 200
        yield resp

    monkeypatch.setattr(notification_service.urllib.request, "urlopen", _cm)
    return calls


# --- notify_run_failure ---


def test_notify_run_failure_noop_when_url_unset(recorder, monkeypatch):
    monkeypatch.setattr(notification_service.settings, "WEBHOOK_URL", "")

    notification_service.notify_run_failure("p1", "r1", "boom")

    assert recorder.submissions == []


def test_notify_run_failure_submits_when_url_set(recorder, monkeypatch):
    monkeypatch.setattr(notification_service.settings, "WEBHOOK_URL", "https://hook.example")

    notification_service.notify_run_failure("my-pipe", "run-123", "err msg", triggered_by="retry")

    assert len(recorder.submissions) == 1
    fn, args, _ = recorder.submissions[0]
    assert fn is notification_service._send_webhook
    payload = args[0]
    assert payload["event"] == "pipeline.run.failed"
    assert payload["data"]["pipeline_name"] == "my-pipe"
    assert payload["data"]["run_id"] == "run-123"
    assert payload["data"]["error_message"] == "err msg"
    assert payload["data"]["triggered_by"] == "retry"
    assert "timestamp" in payload


# --- notify_cdc_failure ---


def test_notify_cdc_failure_noop_when_url_unset(recorder, monkeypatch):
    monkeypatch.setattr(notification_service.settings, "WEBHOOK_URL", "")
    notification_service.notify_cdc_failure("job1", "j-id", "boom")
    assert recorder.submissions == []


def test_notify_cdc_failure_submits_expected_payload(recorder, monkeypatch):
    monkeypatch.setattr(notification_service.settings, "WEBHOOK_URL", "https://hook.example")

    notification_service.notify_cdc_failure("sync-job", "job-42", "conn refused")

    assert len(recorder.submissions) == 1
    payload = recorder.submissions[0][1][0]
    assert payload["event"] == "cdc.sync.failed"
    assert payload["data"]["job_name"] == "sync-job"
    assert payload["data"]["job_id"] == "job-42"
    assert payload["data"]["error_message"] == "conn refused"


# --- _send_webhook ---


def test_send_webhook_noop_when_no_url(monkeypatch, fake_urlopen):
    monkeypatch.setattr(notification_service.settings, "WEBHOOK_URL", "")
    monkeypatch.setattr(notification_service.settings, "WEBHOOK_SECRET", "")

    notification_service._send_webhook({"event": "x"})

    assert fake_urlopen == []


def test_send_webhook_posts_json_without_signature(monkeypatch, fake_urlopen):
    monkeypatch.setattr(notification_service.settings, "WEBHOOK_URL", "https://hook.example/a")
    monkeypatch.setattr(notification_service.settings, "WEBHOOK_SECRET", "")

    notification_service._send_webhook({"event": "x", "n": 1})

    assert len(fake_urlopen) == 1
    call = fake_urlopen[0]
    assert call["url"] == "https://hook.example/a"
    assert call["method"] == "POST"
    # Headers keys in urllib are capitalized
    assert call["headers"]["Content-type"] == "application/json"
    assert "X-webhook-signature" not in call["headers"]
    assert json.loads(call["data"]) == {"event": "x", "n": 1}


def test_send_webhook_signs_payload_when_secret_set(monkeypatch, fake_urlopen):
    monkeypatch.setattr(notification_service.settings, "WEBHOOK_URL", "https://hook.example/a")
    monkeypatch.setattr(notification_service.settings, "WEBHOOK_SECRET", "supersecret")

    payload = {"event": "x"}
    notification_service._send_webhook(payload)

    call = fake_urlopen[0]
    expected_sig = hmac.new(
        b"supersecret", json.dumps(payload).encode("utf-8"), hashlib.sha256
    ).hexdigest()
    assert call["headers"]["X-webhook-signature"] == f"sha256={expected_sig}"


def test_send_webhook_override_url_and_secret(monkeypatch, fake_urlopen):
    monkeypatch.setattr(notification_service.settings, "WEBHOOK_URL", "https://default.example")
    monkeypatch.setattr(notification_service.settings, "WEBHOOK_SECRET", "default")

    payload = {"event": "x"}
    notification_service._send_webhook(payload, url="https://override.example", secret="override-sec")

    call = fake_urlopen[0]
    assert call["url"] == "https://override.example"
    expected_sig = hmac.new(
        b"override-sec", json.dumps(payload).encode("utf-8"), hashlib.sha256
    ).hexdigest()
    assert call["headers"]["X-webhook-signature"] == f"sha256={expected_sig}"


def test_send_webhook_swallows_url_error(monkeypatch):
    """URLError should be caught and logged, not raised."""
    import urllib.error

    def _raise(*a, **kw):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(notification_service.settings, "WEBHOOK_URL", "https://hook.example")
    monkeypatch.setattr(notification_service.urllib.request, "urlopen", _raise)

    # Should not raise
    notification_service._send_webhook({"event": "x"})


# --- send_to_external ---


def test_send_to_external_success(monkeypatch, fake_urlopen):
    result = notification_service.send_to_external(
        "https://slack.example/webhook",
        {"text": "hi"},
        secret="s",
    )
    assert result == {"success": True, "url": "https://slack.example/webhook"}
    assert len(fake_urlopen) == 1
    assert fake_urlopen[0]["url"] == "https://slack.example/webhook"


def test_send_to_external_catches_unexpected_error(monkeypatch):
    def _raise(*a, **kw):
        raise RuntimeError("unexpected")

    monkeypatch.setattr(notification_service, "_send_webhook", _raise)

    result = notification_service.send_to_external("https://x", {"p": 1})
    assert result["success"] is False
    assert result["url"] == "https://x"
    assert "unexpected" in result["error"]
