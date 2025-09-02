import { getCookie, verifyToken } from '../../_lib/auth.js';

const cors = (req) => ({
  'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
});

const json = (req, body, init = {}) => new Response(
  JSON.stringify(body),
  { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(req), ...(init.headers || {}) }, ...init }
);

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: cors(request) });
}

export async function onRequestGet({ request, env }) {
  const token = getCookie(request, 'session');
  if (!token) return json(request, { ok: true, loggedIn: false });
  const payload = await verifyToken(env.AUTH_SECRET, token);
  if (!payload) return json(request, { ok: true, loggedIn: false });
  return json(request, { ok: true, loggedIn: true, username: payload.u });
}

