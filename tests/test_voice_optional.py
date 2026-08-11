import os

import pytest

# This test is optional and skipped by default. Set RUN_VOICE_TESTS=1 to enable it.
if os.getenv("RUN_VOICE_TESTS") != "1":
    pytest.skip("Skipping voice tests unless RUN_VOICE_TESTS=1", allow_module_level=True)


def test_voice_import():
    import importlib

    m = importlib.import_module("voice_engine")
    assert hasattr(m, "listen_user")
