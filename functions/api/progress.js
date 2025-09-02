/**
 * Cloudflare Pages Function: /api/progress
 * D1 schema:
 *   CREATE TABLE IF NOT EXISTS progress (
 *     username TEXT NOT NULL,
 *     book TEXT NOT NULL,
 *     idx INTEGER NOT NULL,
 *     updated_at REAL NOT NULL,
 *     PRIMARY KEY (username, book)
 *   );
 * Bind D1 as "DB" in Pages → Settings → Functions → D1 Bindings.
 */

import { getCookie, verifyToken } from '../../_lib/auth.js';

const cors = (req) => ({
  'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
});

const json = (req, body, init = {}) => new Response(
  JSON.stringify(body),
  { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(req), ...(init.headers || {}) }, ...init }
);

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request) });
}

async function requireUser(request, env) {
  const token = getCookie(request, 'session');
  if (!token) return null;
  const payload = await verifyToken(env.AUTH_SECRET, token);
  if (!payload || !payload.u) return null;
  return payload.u;
}

export async function onRequestGet({ request, env }) {
  const username = await requireUser(request, env);
  if (!username) return json(request, { ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const { results } = await env.DB.prepare('SELECT book, idx FROM progress WHERE username = ?').bind(username).all();
    const items = {};
    for (const row of results || []) items[row.book] = Number(row.idx);
    return json(request, { ok: true, username, items });
  } catch (e) {
    return json(request, { ok: false, error: String(e) }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  const username = await requireUser(request, env);
  if (!username) return json(request, { ok: false, error: 'unauthorized' }, { status: 401 });
  let data;
  try { data = await request.json(); } catch { return json(request, { ok: false, error: 'invalid json' }, { status: 400 }); }
  const now = Date.now() / 1000;
  try {
    if (data && typeof data.items === 'object' && data.items) {
      const stmts = [];
      for (const [book, idxRaw] of Object.entries(data.items)) {
        const idx = Number.parseInt(idxRaw, 10);
        if (!book || Number.isNaN(idx)) continue;
        stmts.push(env.DB
          .prepare('INSERT INTO progress(username, book, idx, updated_at) VALUES(?,?,?,?) ON CONFLICT(username, book) DO UPDATE SET idx=excluded.idx, updated_at=excluded.updated_at')
          .bind(username, String(book), idx, now));
      }
      if (stmts.length) await env.DB.batch(stmts);
      return json(request, { ok: true });
    }
    const book = String(data?.book || '').trim();
    const idx = Number.parseInt(data?.index, 10);
    if (!book || Number.isNaN(idx)) return json(request, { ok: false, error: 'missing book/index' }, { status: 400 });
    await env.DB
      .prepare('INSERT INTO progress(username, book, idx, updated_at) VALUES(?,?,?,?) ON CONFLICT(username, book) DO UPDATE SET idx=excluded.idx, updated_at=excluded.updated_at')
      .bind(username, book, idx, now)
      .run();
    return json(request, { ok: true });
  } catch (e) {
    return json(request, { ok: false, error: String(e) }, { status: 500 });
  }
}
