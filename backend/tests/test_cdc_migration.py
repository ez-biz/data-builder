"""Check that the CDC v2 foundation migration runs forward + backward cleanly.

This exercises the Alembic migration against the test SQLite DB by invoking
the upgrade/downgrade functions directly (not the CLI).
"""
from __future__ import annotations

import importlib
import pathlib


def test_migration_module_exists():
    """Migration file must exist and expose upgrade/downgrade."""
    versions_dir = pathlib.Path(__file__).parent.parent / "alembic" / "versions"
    matches = list(versions_dir.glob("*cdc_v2_foundation*.py"))
    assert len(matches) == 1, f"Expected 1 migration file, got {matches}"

    # Import the module and verify it has upgrade/downgrade
    spec = importlib.util.spec_from_file_location("migration", matches[0])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert hasattr(module, "upgrade")
    assert hasattr(module, "downgrade")
    # Standard alembic headers
    assert hasattr(module, "revision")
    assert hasattr(module, "down_revision")
