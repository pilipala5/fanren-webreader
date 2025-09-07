/**
 * Cloudflare Pages Function: /api/favorites
 * - GET: list user's favorites
 * - POST: toggle { action: 'add'|'remove', book: string }
 */

import { getCookie, verifyToken } from '../_lib/auth.js';

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
    const { results } = await env.DB
      .prepare('SELECT book, created_at FROM favorites WHERE username = ? ORDER BY created_at DESC')
      .bind(username)
      .all();
    return json(request, { ok: true, items: (results || []).map(r => ({ book: r.book, created_at: Number(r.created_at) })) });
  } catch (e) {
    return json(request, { ok: false, error: String(e) }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  const username = await requireUser(request, env);
  if (!username) return json(request, { ok: false, error: 'unauthorized' }, { status: 401 });
  let data;
  try { data = await request.json(); } catch { return json(request, { ok: false, error: 'invalid json' }, { status: 400 }); }
  const action = String(data?.action || '').toLowerCase();
  const book = String(data?.book || '').trim();
  if (!book) return json(request, { ok: false, error: 'missing book' }, { status: 400 });
  try {
    if (action === 'add') {
      const now = Date.now() / 1000;
      await env.DB.prepare('INSERT INTO favorites(username, book, created_at) VALUES(?,?,?) ON CONFLICT(username, book) DO NOTHING')
        .bind(username, book, now)
        .run();
      return json(request, { ok: true, action: 'add' });
    } else if (action === 'remove') {
      await env.DB.prepare('DELETE FROM favorites WHERE username = ? AND book = ?').bind(username, book).run();
      return json(request, { ok: true, action: 'remove' });
    }
    return json(request, { ok: false, error: 'invalid action' }, { status: 400 });
  } catch (e) {
    return json(request, { ok: false, error: String(e) }, { status: 500 });
  }
}

