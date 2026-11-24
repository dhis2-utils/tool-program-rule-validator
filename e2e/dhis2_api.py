"""Minimal DHIS2 API client for the e2e suite.

The instance and the user come from the environment (DHIS2_URL, DHIS2_USER,
DHIS2_PASS). There are no defaults: run.sh checks that all three are set.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ["DHIS2_URL"].rstrip("/")
USER = os.environ["DHIS2_USER"]
PASSWORD = os.environ["DHIS2_PASS"]

# Characters kept as they are when quoting a path with its query string.
_SAFE = "/?&=:,.[]{}#@'()*+!-_~;$"


def _auth_header() -> str:
    token = base64.b64encode(f"{USER}:{PASSWORD}".encode()).decode()
    return f"Basic {token}"


def api(
    method: str,
    path: str,
    body: dict | list | bytes | None = None,
    content_type: str = "application/json",
    timeout: int = 300,
):
    """Call the API; return (status, parsed JSON or None)."""
    url = f"{BASE}/api/" + urllib.parse.quote(path.lstrip("/"), safe=_SAFE)
    data = None
    if body is not None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", _auth_header())
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        raw = error.read()
        status = error.code
    try:
        return status, json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return status, {"_raw": raw[:500].decode(errors="replace")}


def upload_app(zip_path: str) -> int:
    """POST an app bundle to /api/apps as multipart form data; return status."""
    boundary = "----e2eboundary" + os.urandom(8).hex()
    with open(zip_path, "rb") as handle:
        payload = handle.read()
    name = os.path.basename(zip_path)
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{name}"\r\n'
        "Content-Type: application/zip\r\n\r\n"
    ).encode() + payload + f"\r\n--{boundary}--\r\n".encode()
    status, _ = api(
        "POST", "apps", body, f"multipart/form-data; boundary={boundary}"
    )
    return status


def session_cookie() -> tuple[str, str]:
    """Return a session cookie (name, value) from a Basic-auth GET /api/me.

    Works on 2.40 and later. POST /api/auth/login does not exist before 2.41.
    """
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


def new_uids(count: int) -> list[str]:
    status, data = api("GET", f"system/id?limit={count}")
    if status != 200:
        raise RuntimeError(f"system/id -> {status}")
    return data["codes"]
