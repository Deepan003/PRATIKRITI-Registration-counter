/**
 * Shared loader: reads the four response sheets (service account) and aggregates them.
 * Used by /api/stats (public part) and /api/fees (password-protected part).
 * Cached for 60 s per function instance; concurrent requests share one read; if Google is
 * unreachable the last good result is reused.
 */
import { EVENTS } from './events.js';
import { aggregate } from './aggregate.js';
import { credentials, sheetId, readRows } from './sheets.js';

const CACHE_TTL_MS = 60_000;

let lastGood = { stats: null, at: 0 };
const lastRows = new Map(); // eventId -> rows, so one failing sheet doesn't blank its event
let inflight = null;

export class NotConfigured extends Error {}

/** @returns {Promise<{ stats: object, cache: 'HIT'|'MISS'|'STALE' }>} */
export async function loadStats() {
  let creds = null;
  try {
    creds = credentials();
  } catch {
    creds = null;
  }
  if (!creds) throw new NotConfigured('service account not configured');

  if (lastGood.stats && Date.now() - lastGood.at < CACHE_TTL_MS) return { stats: lastGood.stats, cache: 'HIT' };
  try {
    inflight ??= build(creds).finally(() => (inflight = null));
    const stats = await inflight;
    lastGood = { stats, at: Date.now() };
    return { stats, cache: 'MISS' };
  } catch (err) {
    console.error('sheets failed:', err && err.message);
    if (lastGood.stats) return { stats: lastGood.stats, cache: 'STALE' };
    throw err;
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
  return stats;
}

// ---- shared response helpers ------------------------------------------------------------
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

export function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

const hits = new Map();
/** Per-IP request limit (per function instance). */
export function allow(ip, max = 120, windowMs = 60_000) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    hits.set(ip, { count: 1, reset: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}
