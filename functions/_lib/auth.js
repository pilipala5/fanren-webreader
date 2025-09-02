// Utility for Cloudflare Pages Functions auth

const enc = new TextEncoder();

export function b64urlEncode(buf) {
  let b64;
  if (buf instanceof Uint8Array) {
    b64 = btoa(String.fromCharCode(...buf));
  } else if (buf instanceof ArrayBuffer) {
    b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  } else if (typeof buf === 'string') {
    b64 = btoa(buf);
  } else {
    b64 = btoa(String(buf));
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function hex(buf) {
  const v = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  return [...v].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randomSaltHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return hex(arr);
}

export async function sha256Hex(str) {
  const dig = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return hex(dig);
}

export async function hashPassword(saltHex, password) {
  return await sha256Hex(`${saltHex}:${password}`);
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signToken(secret, payload) {
  const key = await importHmacKey(secret);
  const body = JSON.stringify(payload);
  const bodyB64 = b64urlEncode(body);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(bodyB64));
  const sigB64 = b64urlEncode(sig);
  return `${bodyB64}.${sigB64}`;
}

export async function verifyToken(secret, token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [bodyB64, sigB64] = token.split('.', 2);
  try {
    const key = await importHmacKey(secret);
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('HMAC', key, sig, enc.encode(bodyB64));
    if (!ok) return null;
    const jsonStr = atob(bodyB64.replace(/-/g,'+').replace(/_/g,'/'));
    const payload = JSON.parse(jsonStr);
    if (payload.exp && Date.now()/1000 > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export function getCookie(req, name) {
  const h = req.headers.get('Cookie') || '';
  const parts = h.split(';').map(s => s.trim());
  for (const p of parts) {
    if (!p) continue;
    const idx = p.indexOf('=');
    if (idx < 0) continue;
    const k = decodeURIComponent(p.slice(0, idx).trim());
    if (k === name) return decodeURIComponent(p.slice(idx+1));
  }
  return null;
}

export function setSessionCookieHeaders(request, token, maxAgeSec = 60*60*24*30) {
  const url = new URL(request.url);
  const secure = url.protocol === 'https:';
  const attrs = [
    `session=${encodeURIComponent(token)}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    secure ? 'Secure' : '',
    `Max-Age=${maxAgeSec}`,
  ].filter(Boolean).join('; ');
  return { 'Set-Cookie': attrs };
}

export function clearSessionCookieHeaders(request) {
  const url = new URL(request.url);
  const secure = url.protocol === 'https:';
  const attrs = [
    `session=`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    secure ? 'Secure' : '',
    `Max-Age=0`,
  ].filter(Boolean).join('; ');
  return { 'Set-Cookie': attrs };
}

