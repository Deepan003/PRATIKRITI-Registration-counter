/**
 * GET /api/stats — public, counts-only statistics for Pratikriti.
 *
 *  - Registrations, submissions, genres, date-wise series and colleges. No fee figures:
 *    those are only served by the password-protected /api/fees.
 *  - No names, contacts, transaction IDs or Drive links ever leave the server.
 *  - Cached for 60 s in the function and on Vercel's CDN; per-IP rate limit.
 */
import { loadStats, NotConfigured, json, allow } from '../lib/data.js';
import { clientIp } from '../lib/auth.js';

export async function GET(request) {
  if (!allow(clientIp(request))) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  try {
    const { stats, cache } = await loadStats();
    const { fees, ...pub } = stats; // never publish the money side
    return json(pub, 200, {
      'Cache-Control': 'public, max-age=30',
      'CDN-Cache-Control': cache === 'STALE' ? 'public, s-maxage=15' : 'public, s-maxage=60, stale-while-revalidate=600',
      'X-Data-Cache': cache,
    });
  } catch (err) {
    if (err instanceof NotConfigured) return json({ error: 'not_configured' }, 503);
    return json({ error: 'upstream_unavailable' }, 502, { 'Retry-After': '30' });
  }
}
