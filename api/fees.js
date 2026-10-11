/**
 * GET /api/fees — fee collection figures, password-protected.
 *
 *  - Requires the session cookie set by /api/login (FEES_PASSWORD); otherwise 401.
 *  - Private: never cached on the shared CDN.
 */
import { loadStats, NotConfigured, json, allow } from '../lib/data.js';
import { configured, isAuthed, clientIp } from '../lib/auth.js';

export async function GET(request) {
  if (!allow(clientIp(request))) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  if (!configured()) return json({ error: 'not_configured' }, 503);
  if (!isAuthed(request)) return json({ error: 'unauthorized' }, 401, { Vary: 'Cookie' });
  try {
    const { stats, cache } = await loadStats();
    return json({
      updated: stats.updated,
      timezone: stats.timezone,
      days: stats.days,
      events: stats.events.map(({ id, name, connected, breakdown }) => ({ id, name, connected, breakdown })),
      fees: stats.fees,
    }, 200, { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Data-Cache': cache });
  } catch (err) {
    if (err instanceof NotConfigured) return json({ error: 'not_configured' }, 503);
    return json({ error: 'upstream_unavailable' }, 502, { 'Retry-After': '30' });
  }
}
