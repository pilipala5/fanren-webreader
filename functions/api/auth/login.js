import { hashPassword, setSessionCookieHeaders, signToken } from '../../_lib/auth.js';

const cors = (req) => ({
  'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const json = (req, body, init = {}) => new Response(
  JSON.stringify(body),
  { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(req), ...(init.headers || {}) }, ...init }
);

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function onRequestPost({ request, env }) {
  let data;
  try { data = await request.json(); } catch { data = null; }
  const username = (data?.username || '').trim();
  const password = String(data?.password || '');
  if (!username || !password) return json(request, { ok: false, error: 'missing username/password' }, { status: 400 });

  try {
    const row = await env.DB.prepare('SELECT username, pass_hash, salt FROM users WHERE username=?').bind(username).first();
    if (!row) return json(request, { ok: false, error: 'invalid credentials' }, { status: 401 });

    const expected = row.pass_hash;
    const calc = await hashPassword(row.salt, password);
    if (expected !== calc) return json(request, { ok: false, error: 'invalid credentials' }, { status: 401 });

    const payload = { u: username, iat: Date.now()/1000, exp: Date.now()/1000 + 60*60*24*30 };
    const token = await signToken(env.AUTH_SECRET, payload);
    const headers = setSessionCookieHeaders(request, token);
    return json(request, { ok: true, username }, { headers });
  } catch (e) {
    return json(request, { ok: false, error: String(e) }, { status: 500 });
  }
}

