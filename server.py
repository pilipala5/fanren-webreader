#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import os
import sqlite3
import sys
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote
import mimetypes
import hashlib
import secrets
from http import cookies


DB_DIR = os.path.join(os.path.dirname(__file__), 'data')
DB_PATH = os.path.join(DB_DIR, 'progress.db')


def ensure_db():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS progress (
                username TEXT NOT NULL,
                book TEXT NOT NULL,
                idx INTEGER NOT NULL,
                updated_at REAL NOT NULL,
                PRIMARY KEY (username, book)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                created_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                sid TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                created_at REAL NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def db_get_user_progress(username: str):
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute("SELECT book, idx FROM progress WHERE username=?", (username,))
        return {row[0]: int(row[1]) for row in cur.fetchall()}
    finally:
        conn.close()


def db_set_progress(username: str, book: str, idx: int):
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT INTO progress(username, book, idx, updated_at) VALUES(?,?,?,?)\n"
            "ON CONFLICT(username, book) DO UPDATE SET idx=excluded.idx, updated_at=excluded.updated_at",
            (username, book, int(idx), time.time()),
        )
        conn.commit()
    finally:
        conn.close()


# -------- user & session helpers --------

def _valid_username(u: str) -> bool:
    if not (3 <= len(u) <= 32):
        return False
    for ch in u:
        if not (ch.isalnum() or ch in ['_', '-', '.']):
            return False
    return True


def _hash_password(pw: str, salt=None) -> str:
    if salt is None:
        salt = secrets.token_hex(16)
    h = hashlib.sha256((salt + pw).encode('utf-8')).hexdigest()
    return f"{salt}${h}"


def _verify_password(pw: str, stored: str) -> bool:
    try:
        salt, _hash = stored.split('$', 1)
    except ValueError:
        return False
    return _hash_password(pw, salt) == stored


def db_create_user(username: str, password: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute("SELECT 1 FROM users WHERE username=?", (username,))
        if cur.fetchone():
            return False
        ph = _hash_password(password)
        conn.execute(
            "INSERT INTO users(username, password_hash, created_at) VALUES(?,?,?)",
            (username, ph, time.time()),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def db_verify_user(username: str, password: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute("SELECT password_hash FROM users WHERE username=?", (username,))
        row = cur.fetchone()
        if not row:
            return False
        return _verify_password(password, row[0])
    finally:
        conn.close()


def db_create_session(username: str) -> str:
    sid = secrets.token_urlsafe(24)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT INTO sessions(sid, username, created_at) VALUES(?,?,?)",
            (sid, username, time.time()),
        )
        conn.commit()
    finally:
        conn.close()
    return sid


def db_delete_session(sid: str):
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("DELETE FROM sessions WHERE sid=?", (sid,))
        conn.commit()
    finally:
        conn.close()


def db_get_username_by_session(sid: str):
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute("SELECT username FROM sessions WHERE sid=?", (sid,))
        row = cur.fetchone()
        return row[0] if row else None
    finally:
        conn.close()


class Handler(SimpleHTTPRequestHandler):
    # Serve from provided directory, default is current
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def end_headers(self):
        # CORS for convenience
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/health':
            self._json_response({"ok": True})
            return
        if parsed.path == '/api/auth/me':
            username = self._current_username()
            if username:
                self._json_response({"ok": True, "loggedIn": True, "username": username})
            else:
                self._json_response({"ok": True, "loggedIn": False})
            return
        if parsed.path == '/api/progress':
            params = parse_qs(parsed.query)
            # Prefer session user; fallback to explicit username param for compatibility
            username = self._current_username()
            if not username:
                username = (params.get('username') or [''])[0].strip()
            if not username:
                self._json_response({"ok": False, "error": "missing username"}, status=401)
                return
            try:
                items = db_get_user_progress(username)
            except Exception as e:
                self._json_response({"ok": False, "error": str(e)}, status=500)
                return
            self._json_response({"ok": True, "username": username, "items": items})
            return

        # default: static
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/auth/register':
            data = self._read_json()
            if data is None:
                self._json_response({"ok": False, "error": "invalid json"}, status=400)
                return
            username = (data.get('username') or '').strip()
            password = (data.get('password') or '')
            if not username or not password:
                self._json_response({"ok": False, "error": "missing username/password"}, status=400)
                return
            if not _valid_username(username):
                self._json_response({"ok": False, "error": "invalid username"}, status=400)
                return
            try:
                created = db_create_user(username, password)
                if not created:
                    self._json_response({"ok": False, "error": "user exists"}, status=400)
                    return
                sid = db_create_session(username)
                self._set_session_cookie(sid)
                self._json_response({"ok": True, "username": username})
            except Exception as e:
                self._json_response({"ok": False, "error": str(e)}, status=500)
            return

        if parsed.path == '/api/auth/login':
            data = self._read_json()
            if data is None:
                self._json_response({"ok": False, "error": "invalid json"}, status=400)
                return
            username = (data.get('username') or '').strip()
            password = (data.get('password') or '')
            if not username or not password:
                self._json_response({"ok": False, "error": "missing username/password"}, status=400)
                return
            if not db_verify_user(username, password):
                self._json_response({"ok": False, "error": "invalid credentials"}, status=401)
                return
            sid = db_create_session(username)
            self._set_session_cookie(sid)
            self._json_response({"ok": True, "username": username})
            return

        if parsed.path == '/api/auth/logout':
            sid = self._get_cookie_value('sid')
            if sid:
                db_delete_session(sid)
            # expire cookie
            self._expire_session_cookie()
            self._json_response({"ok": True})
            return

        if parsed.path == '/api/progress':
            data = self._read_json()
            if data is None:
                self._json_response({"ok": False, "error": "invalid json"}, status=400)
                return

            # Prefer session user; fallback to explicit username for compatibility
            username = self._current_username()
            if not username:
                username = (data.get('username') or '').strip()
            if not username:
                self._json_response({"ok": False, "error": "missing username"}, status=401)
                return
            # Allow single or batch
            if 'items' in data and isinstance(data['items'], dict):
                try:
                    for book, idx in data['items'].items():
                        db_set_progress(username, str(book), int(idx))
                except Exception as e:
                    self._json_response({"ok": False, "error": str(e)}, status=500)
                    return
                self._json_response({"ok": True})
                return
            book = str(data.get('book') or '').strip()
            try:
                idx = int(data.get('index'))
            except Exception:
                idx = None
            if not book or idx is None:
                self._json_response({"ok": False, "error": "missing book/index"}, status=400)
                return
            try:
                db_set_progress(username, book, idx)
            except Exception as e:
                self._json_response({"ok": False, "error": str(e)}, status=500)
                return
            self._json_response({"ok": True})
            return

        return super().do_POST()

    def send_head(self):
        # Serve index as viewer.html by default
        if self.path in ('/', '', '/index.html'):
            self.path = '/viewer.html'
        return super().send_head()

    def _json_response(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    # -------- helpers: auth/session/json ----------
    def _read_json(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except Exception:
            length = 0
        raw = self.rfile.read(length) if length > 0 else b''
        try:
            return json.loads(raw.decode('utf-8') or '{}')
        except Exception:
            return None

    def _get_cookie_value(self, key: str):
        raw = self.headers.get('Cookie')
        if not raw:
            return None
        try:
            c = cookies.SimpleCookie()
            c.load(raw)
            if key in c:
                return c[key].value
        except Exception:
            return None
        return None

    def _set_session_cookie(self, sid: str):
        c = cookies.SimpleCookie()
        c['sid'] = sid
        c['sid']['path'] = '/'
        # Note: not setting Secure/SameSite here for simplicity in local dev
        # c['sid']['httponly'] = True  # http.cookies does not expose flag directly to header, but we keep simple
        self.send_header('Set-Cookie', c.output(header='').strip())

    def _expire_session_cookie(self):
        c = cookies.SimpleCookie()
        c['sid'] = ''
        c['sid']['path'] = '/'
        c['sid']['max-age'] = '0'
        self.send_header('Set-Cookie', c.output(header='').strip())

    def _current_username(self):
        sid = self._get_cookie_value('sid')
        if not sid:
            return None
        return db_get_username_by_session(sid)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Static novel server with simple progress API')
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--root', default='.')
    args = parser.parse_args(argv)

    ensure_db()
    directory = os.path.abspath(args.root)
    print(f"Serving {directory} on http://{args.host}:{args.port}")
    httpd = ThreadingHTTPServer((args.host, args.port), lambda *a, **kw: Handler(*a, directory=directory, **kw))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
