#!/usr/bin/env python3
"""Small GitHub-compatible deploy webhook.

It validates X-Hub-Signature-256 and triggers deploy/deploy.sh asynchronously.
Keep it bound to 127.0.0.1 and expose it through Nginx HTTPS.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HOST = os.environ.get("WEBHOOK_HOST", "127.0.0.1")
PORT = int(os.environ.get("WEBHOOK_PORT", "9009"))
SECRET = os.environ.get("DEPLOY_WEBHOOK_SECRET", "")
REPO_DIR = Path(os.environ.get("DEPLOY_REPO_DIR", "/opt/duizhangAgent"))
DEPLOY_SCRIPT = Path(os.environ.get("DEPLOY_SCRIPT", str(REPO_DIR / "deploy/deploy.sh")))
BRANCH = os.environ.get("DEPLOY_BRANCH", "main")
LOG_FILE = Path(os.environ.get("DEPLOY_LOG_FILE", "/var/log/duizhangAgent-deploy.log"))


def _valid_signature(body: bytes, header: str | None) -> bool:
    if not SECRET:
        return False
    if not header or not header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(SECRET.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)


def _log(message: str) -> None:
    print(message, flush=True)


class Handler(BaseHTTPRequestHandler):
    server_version = "duizhang-deploy-webhook/1.0"

    def do_POST(self) -> None:  # noqa: N802 - stdlib method name
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)

        if not _valid_signature(body, self.headers.get("X-Hub-Signature-256")):
            _log("reject webhook: invalid signature")
            self._json(401, {"ok": False, "error": "invalid signature"})
            return

        try:
            payload = json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            _log("reject webhook: invalid json")
            self._json(400, {"ok": False, "error": "invalid json"})
            return

        event = str(self.headers.get("X-GitHub-Event") or "")
        if event == "ping":
            _log("ignore webhook: ping event")
            self._json(202, {"ok": True, "ignored": True, "reason": "ping event"})
            return
        if event and event != "push":
            _log(f"ignore webhook: event {event} is not push")
            self._json(202, {"ok": True, "ignored": True, "reason": f"event {event} is not push"})
            return

        ref = str(payload.get("ref") or "")
        expected_ref = f"refs/heads/{BRANCH}"
        if not ref:
            _log("ignore webhook: missing ref")
            self._json(202, {"ok": True, "ignored": True, "reason": "missing ref"})
            return
        if ref != expected_ref:
            _log(f"ignore webhook: ref {ref} != {expected_ref}")
            self._json(202, {"ok": True, "ignored": True, "reason": f"ref {ref} != {expected_ref}"})
            return

        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        log_handle = LOG_FILE.open("ab", buffering=0)
        env = os.environ.copy()
        env.setdefault("APP_DIR", str(REPO_DIR))
        env.setdefault("DEPLOY_BRANCH", BRANCH)
        subprocess.Popen(
            [str(DEPLOY_SCRIPT)],
            cwd=str(REPO_DIR),
            env=env,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        _log(f"start deploy: {ref}")
        self._json(202, {"ok": True, "started": True})

    def do_GET(self) -> None:  # noqa: N802 - stdlib method name
        if self.path == "/health":
            self._json(200, {"ok": True})
            return
        self._json(404, {"ok": False, "error": "not found"})

    def log_message(self, fmt: str, *args: object) -> None:
        return

    def _json(self, status: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"deploy webhook listening on http://{HOST}:{PORT}", flush=True)
    httpd.serve_forever()
