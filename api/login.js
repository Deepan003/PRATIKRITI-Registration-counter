/**
 * POST /api/login   { "password": "..." }  → 204 + session cookie, 401 wrong, 429 locked out
 * DELETE /api/login                         → 204, cookie cleared (sign out)
 */
import {
  configured, passwordMatches, issueToken, sessionCookie, clearCookie,
  clientIp, lockedFor, recordFailure, clearFailures,
} from '../lib/auth.js';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'application/json; charset=utf-8' };
const reply = (status, obj, extra = {}) => new Response(obj ? JSON.stringify(obj) : null, { status, headers: { ...HEADERS, ...extra } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // same-origin fetches from some browsers omit it; SameSite covers the rest
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function POST(request) {
  if (!sameOrigin(request)) return reply(403, { error: 'forbidden' });
  if (!configured()) return reply(503, { error: 'not_configured' });

  const ip = clientIp(request);
  const wait = lockedFor(ip);
  if (wait) return reply(429, { error: 'locked', retryAfter: wait }, { 'Retry-After': String(wait) });

  let password = '';
  try {
    const text = await request.text();
    if (text.length > 1024) return reply(413, { error: 'too_large' });
    password = JSON.parse(text).password;
  } catch {
    return reply(400, { error: 'bad_request' });
  }

  if (!passwordMatches(password)) {
    recordFailure(ip);
    await sleep(350 + Math.random() * 250); // slows guessing, hides timing
    return reply(401, { error: 'wrong_password' });
  }
  clearFailures(ip);
  return reply(204, null, { 'Set-Cookie': sessionCookie(request, issueToken()) });
}

export async function DELETE(request) {
  if (!sameOrigin(request)) return reply(403, { error: 'forbidden' });
  return reply(204, null, { 'Set-Cookie': clearCookie(request) });
}
