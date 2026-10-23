"""Minimal DHIS2 Web API client for the e2e suite (standard library only).

All requests use Basic auth against the instance given by DHIS2_URL.
"""

from __future__ import annotations

import base64
import json
import secrets
import string
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass

UID_LETTERS = string.ascii_letters
UID_CHARS = string.ascii_letters + string.digits


def generate_uid() -> str:
    """A DHIS2 UID: a letter followed by ten letters or digits."""
    return secrets.choice(UID_LETTERS) + "".join(
        secrets.choice(UID_CHARS) for _ in range(10)
    )


@dataclass
class Response:
    status: int
    body: object

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300


class Dhis2Client:
    def __init__(self, base_url: str, user: str, password: str):
        self.base_url = base_url.rstrip("/")
        token = base64.b64encode(f"{user}:{password}".encode()).decode()
        self._auth = f"Basic {token}"

    def _send(self, request: urllib.request.Request, timeout: int) -> Response:
        request.add_header("Authorization", self._auth)
        request.add_header("Accept", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw, status = response.read(), response.status
        except urllib.error.HTTPError as error:
            raw, status = error.read(), error.code
        try:
            body = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            body = {"_raw": raw[:500].decode(errors="replace")}
        return Response(status, body)

    def url(self, path: str) -> str:
        return f"{self.base_url}/api/{path.lstrip('/')}"

    def request(
        self, method: str, path: str, body: object | None = None, timeout: int = 300
    ) -> Response:
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.url(path), data=data, method=method)
        if data is not None:
            request.add_header("Content-Type", "application/json")
        return self._send(request, timeout)

    def get(self, path: str) -> Response:
        return self.request("GET", path)

    def delete(self, path: str) -> Response:
        return self.request("DELETE", path)

    def upload_app(self, zip_path: str) -> Response:
        """POST /api/apps as multipart/form-data with the zip as `file`."""
        boundary = uuid.uuid4().hex
        with open(zip_path, "rb") as handle:
            content = handle.read()
        filename = urllib.parse.quote(zip_path.rsplit("/", 1)[-1])
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            "Content-Type: application/zip\r\n\r\n"
        ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
        request = urllib.request.Request(self.url("apps"), data=body, method="POST")
        request.add_header(
            "Content-Type", f"multipart/form-data; boundary={boundary}"
        )
        return self._send(request, timeout=600)

    def session_cookie(self) -> tuple[str, str]:
        """A session cookie, obtained with a Basic-auth GET /api/me."""
        request = urllib.request.Request(self.url("me"))
        request.add_header("Authorization", self._auth)
        with urllib.request.urlopen(request, timeout=60) as response:
            for cookie in response.headers.get_all("Set-Cookie") or []:
                name, _, value = cookie.split(";", 1)[0].partition("=")
                if "SESSION" in name.upper():
                    return name.strip(), value.strip()
        raise RuntimeError("No session cookie returned from /api/me")
