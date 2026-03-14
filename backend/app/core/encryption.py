from __future__ import annotations

import base64
import json
import hashlib

from cryptography.fernet import Fernet

from app.config import settings

_WEAK_DEFAULTS = {"change-me-in-production", "change-me-in-production-use-openssl-rand-hex-32"}


def _get_fernet() -> Fernet:
    if settings.SECRET_KEY in _WEAK_DEFAULTS:
        import warnings
        warnings.warn(
            "Using default SECRET_KEY — set a strong key via environment variable for production!",
            stacklevel=2,
        )
    # Derive a proper 32-byte key using SHA-256 (deterministic, no salt needed for Fernet)
    derived = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    key = base64.urlsafe_b64encode(derived)
    return Fernet(key)


def encrypt_config(config: dict) -> str:
    f = _get_fernet()
    return f.encrypt(json.dumps(config).encode()).decode()


def decrypt_config(encrypted: str) -> dict:
    f = _get_fernet()
    return json.loads(f.decrypt(encrypted.encode()).decode())
