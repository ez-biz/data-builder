from __future__ import annotations

from app.core.encryption import decrypt_config, encrypt_config


def test_encrypt_decrypt_roundtrip():
    original = {"host": "db.example.com", "password": "super_secret_123!"}
    encrypted = encrypt_config(original)
    assert isinstance(encrypted, str)
    assert "super_secret_123" not in encrypted
    decrypted = decrypt_config(encrypted)
    assert decrypted == original


def test_encrypt_different_each_time():
    """Fernet uses a random IV, so same plaintext produces different ciphertext."""
    config = {"key": "value"}
    enc1 = encrypt_config(config)
    enc2 = encrypt_config(config)
    assert enc1 != enc2
    # But both decrypt to the same value
    assert decrypt_config(enc1) == config
    assert decrypt_config(enc2) == config


def test_encrypt_complex_config():
    config = {
        "host": "db.example.com",
        "port": 5432,
        "ssl": True,
        "tags": ["prod", "primary"],
        "nested": {"key": "value"},
    }
    encrypted = encrypt_config(config)
    decrypted = decrypt_config(encrypted)
    assert decrypted == config
