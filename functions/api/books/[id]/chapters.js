/**
 * POST /api/books/:id/chapters -> append or upsert chapters (require owner)
 * Body: { chapters: [{ index, title, content }, ...] }
 */

import { getCookie, verifyToken } from '../../../_lib/auth.js';

const cors = (req) => ({
  'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

export async function onRequestPost({ request, env, params }) {
  const username = await requireUser(request, env);
  if (!username) return json(request, { ok: false, error: 'unauthorized' }, { status: 401 });
  const id = Number.parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json(request, { ok: false, error: 'bad id' }, { status: 400 });
  let data;
  try { data = await request.json(); } catch { return json(request, { ok: false, error: 'invalid json' }, { status: 400 }); }
  const book = await env.DB.prepare('SELECT id, uploader FROM books WHERE id = ?').bind(id).first();
  if (!book) return json(request, { ok: false, error: 'not found' }, { status: 404 });
  if (book.uploader !== username) return json(request, { ok: false, error: 'forbidden' }, { status: 403 });
  try {
    const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
    const stmts = [];
    for (const ch of chapters) {
      const idx = Number.parseInt(ch?.index, 10);
      const ct = String(ch?.content || '');
      const tt = String(ch?.title || '').slice(0, 300) || `章节 ${idx}`;
      if (!Number.isFinite(idx)) continue;
      stmts.push(env.DB.prepare('INSERT OR REPLACE INTO chapters(book_id, idx, title, content) VALUES(?,?,?,?)').bind(id, idx, tt, ct));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json(request, { ok: true, n: stmts.length });
  } catch (e) {
    return json(request, { ok: false, error: String(e) }, { status: 500 });
  }
}

