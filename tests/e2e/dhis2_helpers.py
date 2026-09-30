"""Shared helpers for the Program Rule Validator e2e suite.

All requests use Basic auth against the instance given by DHIS2_URL.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ["DHIS2_URL"].rstrip("/")
USER = os.environ.get("DHIS2_USER", "local_admin")
PASSWORD = os.environ.get("DHIS2_PASS", "district")

APP_KEY = "tool-pr-validator"


def _auth_header() -> str:
    token = base64.b64encode(f"{USER}:{PASSWORD}".encode()).decode()
    return f"Basic {token}"


def api(
    method: str,
    path: str,
    body: dict | bytes | None = None,
    content_type: str = "application/json",
):
    """Call the DHIS2 API; returns (status, parsed-json-or-None)."""
    url = f"{BASE}/api/" + urllib.parse.quote(
        path.lstrip("/"), safe="/?&=:,.[]{}#@'()*+!-_~;$"
    )
    data = None
    if body is not None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", _auth_header())
    if body is not None:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            raw = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        raw = error.read()
        status = error.code
    try:
        return status, json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return status, {"_raw": raw[:500].decode(errors="replace")}


def session_cookie():
    """Authenticated session cookie via Basic-auth GET /api/me (works 2.40+)."""
    req = urllib.request.Request(
        f"{BASE}/api/me", headers={"Authorization": _auth_header()}
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        for cookie in response.headers.get_all("Set-Cookie") or []:
            head = cookie.split(";", 1)[0]
            name, _, value = head.partition("=")
            if "JSESSIONID" in name:
                return name.strip(), value.strip()
    raise RuntimeError("No JSESSIONID returned from /api/me")


def system_version() -> str:
    status, info = api("GET", "system/info")
    assert status == 200, f"system/info -> {status}"
    return info["version"]


def uid() -> str:
    status, data = api("GET", "system/id?limit=1")
    assert status == 200
    return data["codes"][0]
