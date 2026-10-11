/**
 * Password gate for the fee section. The password lives only in the FEES_PASSWORD environment
 * variable (DASHBOARD_PASSWORD is accepted as a fallback for older setups).
 *
 * A correct password earns an HttpOnly, SameSite=Strict cookie holding "<expiry>.<HMAC>".
 * The HMAC key is derived from the password (+ optional SESSION_SECRET), so changing the
 * password in Vercel signs everyone out. Nothing about the password reaches the browser.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'prk_fees';
const MAX_AGE = 7 * 24 * 60 * 60; // a week
const FAIL_LIMIT = { max: 8, windowMs: 15 * 60 * 1000 };

const sha = (v) => createHash('sha256').update(String(v)).digest();
const secret = (env) => env.FEES_PASSWORD || env.DASHBOARD_PASSWORD || '';
const key = (env) => sha(`${env.SESSION_SECRET || ''}|fees|${secret(env)}`);
const sign = (env, exp) => createHmac('sha256', key(env)).update(String(exp)).digest('base64url');

export const configured = (env = process.env) => Boolean(secret(env));

export function passwordMatches(input, env = process.env) {
  if (!configured(env) || typeof input !== 'string' || input.length > 200) return false;
  return timingSafeEqual(sha(input), sha(secret(env))); // equal-length digests, constant time
}

export function issueToken(env = process.env, now = Date.now()) {
  const exp = Math.floor(now / 1000) + MAX_AGE;
  return `${exp}.${sign(env, exp)}`;
}

export function isAuthed(request, env = process.env, now = Date.now()) {
  if (!configured(env)) return false;
  const token = readCookie(request, COOKIE);
  const m = token && token.match(/^(\d{10})\.([A-Za-z0-9_-]{43})$/);
  if (!m || Number(m[1]) < now / 1000) return false;
  const want = Buffer.from(sign(env, m[1]));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got);
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

const secureFor = (request) => !/^(localhost|127\.0\.0\.1)$/.test(new URL(request.url).hostname);

export function sessionCookie(request, token) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Strict${secureFor(request) ? '; Secure' : ''}`;
}

export function clearCookie(request) {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secureFor(request) ? '; Secure' : ''}`;
}

// ---- brute-force protection: failed attempts per IP --------------------------------------
const fails = new Map();

export function clientIp(request) {
  const h = request.headers;
  return (h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim();
}

/** Seconds until this IP may try again, or 0. */
export function lockedFor(ip, now = Date.now()) {
  const f = fails.get(ip);
  if (!f || f.reset < now) return 0;
  return f.count >= FAIL_LIMIT.max ? Math.ceil((f.reset - now) / 1000) : 0;
}

export function recordFailure(ip, now = Date.now()) {
  if (fails.size > 5000) for (const [k, v] of fails) if (v.reset < now) fails.delete(k);
  const f = fails.get(ip);
  if (!f || f.reset < now) fails.set(ip, { count: 1, reset: now + FAIL_LIMIT.windowMs });
  else f.count += 1;
}

export const clearFailures = (ip) => fails.delete(ip);
