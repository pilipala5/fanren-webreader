/**
 * GET /api/books/:id/chapter/:index -> full text
 */

const cors = (req) => ({
  'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
});

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function onRequestGet({ request, env, params }) {
  const id = Number.parseInt(params.id, 10);
  const idx = Number.parseInt(params.index, 10);
  if (!Number.isFinite(id) || !Number.isFinite(idx)) return new Response('bad request', { status: 400, headers: cors(request) });
  try {
    const ok = await env.DB.prepare('SELECT id FROM books WHERE id = ? AND visibility = "public"').bind(id).first();
    if (!ok) return new Response('not found', { status: 404, headers: cors(request) });
    const row = await env.DB.prepare('SELECT title, content FROM chapters WHERE book_id = ? AND idx = ?').bind(id, idx).first();
    if (!row) return new Response('', { status: 404, headers: cors(request) });
    const body = row.content || '';
    // text/plain allows streaming large chapters better than JSON
    return new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', ...cors(request) } });
  } catch (e) {
    return new Response(String(e), { status: 500, headers: cors(request) });
  }
}

