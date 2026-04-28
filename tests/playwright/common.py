"""Shared helpers for the Playwright test scripts.

These tests are standalone scripts (run with `python3 tests/playwright/test_*.py`),
not pytest. `common.py` exposes configuration and a session-cookie helper.
"""
import json
import os
import urllib.request

BASE_URL = os.environ.get("DHIS2_BASE_URL", "http://localhost:9021")
USER = os.environ.get("DHIS2_USER", "claude")
PASSWD = os.environ.get("DHIS2_PASSWORD", "Test12345!")
DEV_URL = os.environ.get("DEV_URL", "http://localhost:8081/")


def get_session_cookie():
    """Log in via /api/auth/login and return (cookie_name, cookie_value).

    Used to inject a session cookie into a Playwright context, since the
    React-based DHIS2 login form does not respond reliably to scripted
    form fills.
    """
    req = urllib.request.Request(
        f"{BASE_URL}/api/auth/login",
        data=json.dumps({"username": USER, "password": PASSWD}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        for c in r.headers.get_all("Set-Cookie") or []:
            head = c.split(";", 1)[0]
            n, _, v = head.partition("=")
            if "JSESSIONID" in n:
                return n.strip(), v.strip()
    raise RuntimeError("No JSESSIONID returned from /api/auth/login")
