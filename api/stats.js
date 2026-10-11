/**
 * GET /api/stats — counts-only statistics for Pratikriti, behind the password gate.
 *
 *  - Requires the session cookie from /api/login; otherwise 401.
 *  - Reads the four Restricted response sheets as a service account (env vars only).
 *  - Responds with aggregates: no names, contacts, transaction IDs, fees or Drive links.
 *  - Cached for 60 s inside the function (never on the shared CDN, since it's private);
 *    per-IP rate limit; last good copy is served if Google is unreachable.
 */
import { EVENTS } from '../lib/events.js';
import { aggregate } from '../lib/aggregate.js';
import { credentials, sheetId, readRows } from '../lib/sheets.js';
import { configured, isAuthed, clientIp } from '../lib/auth.js';

const CACHE_TTL_MS = 60_000;
const LIMIT = { max: 120, windowMs: 60_000 };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

let lastGood = { body: null, at: 0 };
const lastRows = new Map(); // eventId -> rows, so one failing sheet doesn't blank its event
let inflight = null;
const hits = new Map();

export async function GET(request) {
  if (!allow(clientIp(request))) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  if (!configured()) return json({ error: 'not_configured' }, 503);
  if (!isAuthed(request)) return json({ error: 'unauthorized' }, 401);

  let creds;
  try {
    creds = credentials();
  } catch {
    creds = null;
  }
  if (!creds) return json({ error: 'not_configured' }, 503);

  const now = Date.now();
  if (lastGood.body && now - lastGood.at < CACHE_TTL_MS) return respond(lastGood.body, 'HIT');

  try {
    inflight ??= build(creds).finally(() => (inflight = null));
    const body = await inflight;
    lastGood = { body, at: Date.now() };
    return respond(body, 'MISS');
  } catch (err) {
    console.error('stats failed:', err && err.message);
    if (lastGood.body) return respond(lastGood.body, 'STALE');
    return json({ error: 'upstream_unavailable' }, 502, { 'Retry-After': '30' });
  }
}

async function build(creds) {
  const sheets = {};
  let ok = 0;
  await Promise.all(EVENTS.map(async (ev) => {
    const id = sheetId(process.env[ev.env]);
    if (!id) return; // event not connected yet
    try {
      const rows = await readRows(creds, id);
      lastRows.set(ev.id, rows);
      sheets[ev.id] = rows;
      ok += 1;
    } catch (err) {
      console.error(`${ev.id} sheet failed:`, err && err.message);
      if (lastRows.has(ev.id)) sheets[ev.id] = lastRows.get(ev.id);
    }
  }));
  if (!ok && !Object.keys(sheets).length) throw new Error('no sheets readable');
  const stats = aggregate(sheets);
  for (const w of stats.warnings) console.warn('config:', w);
  stats.warnings = stats.warnings.length; // details stay in the logs
  return JSON.stringify(stats);
}

function allow(ip) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    hits.set(ip, { count: 1, reset: now + LIMIT.windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= LIMIT.max;
}

function respond(body, status) {
  return new Response(body, {
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Data-Cache': status,
    },
  });
}

function json(obj, status, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}
