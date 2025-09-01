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
        if parsed.path == '/api/progress':
            params = parse_qs(parsed.query)
            username = (params.get('username') or [''])[0].strip()
            if not username:
                self._json_response({"ok": False, "error": "missing username"}, status=400)
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
        if parsed.path == '/api/progress':
            length = int(self.headers.get('Content-Length') or 0)
            raw = self.rfile.read(length) if length > 0 else b''
            try:
                data = json.loads(raw.decode('utf-8') or '{}')
            except Exception:
                self._json_response({"ok": False, "error": "invalid json"}, status=400)
                return

            username = (data.get('username') or '').strip()
            if not username:
                self._json_response({"ok": False, "error": "missing username"}, status=400)
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

