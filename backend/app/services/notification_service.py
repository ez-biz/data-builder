"""Webhook notification service for run/CDC failures."""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import urllib.request
import urllib.error

from app.config import settings

logger = logging.getLogger("data_builder.notifications")

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="webhook-worker")


def notify_run_failure(
    pipeline_name: str,
    run_id: str,
    error_message: str,
    triggered_by: str = "manual",
) -> None:
    """Send webhook notification for a pipeline run failure."""
    if not settings.WEBHOOK_URL:
        return

    payload = {
        "event": "pipeline.run.failed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": {
            "pipeline_name": pipeline_name,
            "run_id": run_id,
            "error_message": error_message,
            "triggered_by": triggered_by,
        },
    }
    _executor.submit(_send_webhook, payload)


def notify_cdc_failure(
    job_name: str,
    job_id: str,
    error_message: str,
) -> None:
    """Send webhook notification for a CDC sync failure."""
    if not settings.WEBHOOK_URL:
        return

    payload = {
        "event": "cdc.sync.failed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": {
            "job_name": job_name,
            "job_id": job_id,
            "error_message": error_message,
        },
    }
    _executor.submit(_send_webhook, payload)


def send_to_external(url: str, payload: dict, secret: str = "") -> dict:
    """Send a payload to an external webhook URL. Returns status info."""
    try:
        _send_webhook(payload, url=url, secret=secret)
        return {"success": True, "url": url}
    except Exception as e:
        return {"success": False, "url": url, "error": str(e)}


def _send_webhook(payload: dict, url: str | None = None, secret: str | None = None) -> None:
    """POST JSON payload to webhook URL with optional HMAC signature."""
    target_url = url or settings.WEBHOOK_URL
    signing_secret = secret or settings.WEBHOOK_SECRET

    if not target_url:
        return

    body = json.dumps(payload).encode("utf-8")

    headers = {"Content-Type": "application/json"}

    if signing_secret:
        signature = hmac.new(
            signing_secret.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()
        headers["X-Webhook-Signature"] = f"sha256={signature}"

    req = urllib.request.Request(target_url, data=body, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger.info("Webhook sent to %s: %d", target_url, resp.status)
    except urllib.error.URLError as e:
        logger.error("Webhook to %s failed: %s", target_url, e)
    except Exception:
        logger.exception("Webhook to %s failed", target_url)
