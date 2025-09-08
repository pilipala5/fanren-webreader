/**
 * GET /api/books/:id -> metadata + chapter list (no content)
 */

const cors = (req) => ({
  'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
});

const json = (req, body, init = {}) => new Response(
  JSON.stringify(body),
  { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(req), ...(init.headers || {}) }, ...init }
);

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function onRequestGet({ request, env, params }) {
  const id = Number.parseInt(params.id, 10);
  if (!Number.isFinite(id)) return json(request, { ok: false, error: 'bad id' }, { status: 400 });
  try {
    const bookRow = await env.DB.prepare('SELECT id, title, uploader, visibility, cover, created_at FROM books WHERE id = ?').bind(id).first();
    if (!bookRow) return json(request, { ok: false, error: 'not found' }, { status: 404 });
    if (bookRow.visibility !== 'public') return json(request, { ok: false, error: 'forbidden' }, { status: 403 });
    const { results } = await env.DB.prepare('SELECT idx, title FROM chapters WHERE book_id = ? ORDER BY idx ASC').bind(id).all();
    return json(request, { ok: true, book: {
      id: Number(bookRow.id), title: bookRow.title, uploader: bookRow.uploader, cover: bookRow.cover || null, created_at: Number(bookRow.created_at)
    }, chapters: (results || []).map(r => ({ index: Number(r.idx), title: r.title })) });
  } catch (e) {
    return json(request, { ok: false, error: String(e) }, { status: 500 });
  }
}
