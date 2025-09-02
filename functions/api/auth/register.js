import { randomSaltHex, hashPassword, signToken, setSessionCookieHeaders } from '../../_lib/auth.js';

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
  if (!/^[A-Za-z0-9_\-\.]{3,32}$/.test(username)) return json(request, { ok: false, error: 'invalid username' }, { status: 400 });
  if (password.length < 6) return json(request, { ok: false, error: 'password too short' }, { status: 400 });

  try {
    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username=?').bind(username).first();
    if (exists) return json(request, { ok: false, error: 'username exists' }, { status: 409 });

    const salt = randomSaltHex(16);
    const pass_hash = await hashPassword(salt, password);
    await env.DB.prepare('INSERT INTO users(username, pass_hash, salt, created_at) VALUES(?,?,?,?)')
      .bind(username, pass_hash, salt, Date.now()/1000)
      .run();

    const payload = { u: username, iat: Date.now()/1000, exp: Date.now()/1000 + 60*60*24*30 };
    const token = await signToken(env.AUTH_SECRET, payload);
    const headers = setSessionCookieHeaders(request, token);
    return json(request, { ok: true, username }, { headers });
  } catch (e) {
    return json(request, { ok: false, error: String(e) }, { status: 500 });
  }
}

