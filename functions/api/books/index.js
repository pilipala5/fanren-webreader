/**
 * Cloudflare Pages Function: /api/books
 * - GET: list books with chapter counts
 * - POST: create a book with optional initial chapters (require login)
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
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get('limit') || '50', 10)));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10));
  try {
    const { results } = await env.DB
      .prepare(`SELECT b.id, b.title, b.uploader, b.visibility, b.created_at, COUNT(c.idx) AS chapters
                FROM books b LEFT JOIN chapters c ON c.book_id = b.id
                WHERE b.visibility = 'public'
                GROUP BY b.id
                ORDER BY b.created_at DESC
                LIMIT ? OFFSET ?`)
      .bind(limit, offset)
      .all();
    return json(request, { ok: true, items: (results || []).map(r => ({
      id: Number(r.id),
      title: r.title,
      uploader: r.uploader,
      chapters: Number(r.chapters || 0),
      created_at: Number(r.created_at),
    })) });
  } catch (e) {
    return json(request, { ok: false, error: String(e) }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  const username = await requireUser(request, env);
  if (!username) return json(request, { ok: false, error: 'unauthorized' }, { status: 401 });
  let data;
  try { data = await request.json(); } catch { return json(request, { ok: false, error: 'invalid json' }, { status: 400 }); }
  const titleRaw = String(data?.title || '').trim();
  if (!titleRaw) return json(request, { ok: false, error: 'missing title' }, { status: 400 });
  const title = titleRaw.slice(0, 200);
  const visibility = 'public';
  const now = Date.now() / 1000;
  try {
    const info = await env.DB
      .prepare('INSERT INTO books(title, uploader, visibility, created_at) VALUES(?,?,?,?)')
      .bind(title, username, visibility, now)
      .run();
    // D1 returns lastRowId
    const id = Number(info.lastRowId);
    const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
    if (chapters.length) {
      const stmts = [];
      for (const ch of chapters) {
        const idx = Number.parseInt(ch?.index, 10);
        const ct = String(ch?.content || '');
        const tt = String(ch?.title || '').slice(0, 300) || `章节 ${idx}`;
        if (!Number.isFinite(idx)) continue;
        stmts.push(env.DB.prepare('INSERT OR REPLACE INTO chapters(book_id, idx, title, content) VALUES(?,?,?,?)').bind(id, idx, tt, ct));
      }
      if (stmts.length) await env.DB.batch(stmts);
    }
    return json(request, { ok: true, id });
  } catch (e) {
    return json(request, { ok: false, error: String(e) }, { status: 500 });
  }
}

