/**
 * Turns raw form rows into the public statistics payload.
 * Only counts leave this module: no names, contacts, transaction IDs or file links.
 */
import { EVENTS, TIMEZONE, chitrantarTheme, COLLEGE_ALIASES } from './events.js';

const MAX_DAYS = 120;
const SERIAL_EPOCH = Date.UTC(1899, 11, 30); // Google Sheets day 0

const text = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

/** Sheets serial number (already in the sheet's time zone) or a date string → 'YYYY-MM-DD'. */
function dayOf(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    return new Date(SERIAL_EPOCH + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  }
  const s = text(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // Forms default: M/D/YYYY
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : localDay(new Date(t));
}

export function localDay(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function college(raw) {
  const s = text(raw).replace(/[.,]+$/, '');
  if (!s) return 'Not specified';
  for (const [re, name] of COLLEGE_ALIASES) if (re.test(s)) return name;
  const plain = s === s.toUpperCase() || s === s.toLowerCase();
  return (plain ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s).slice(0, 80);
}

function checkHeaders(ev, headers, warnings) {
  const specs = [ev.institution, ev.photoCount, ev.genre].filter(Boolean);
  for (const spec of specs) {
    const h = text(headers[spec.col]).toLowerCase();
    if (!h.includes(spec.expect)) warnings.push(`${ev.id}: column ${spec.col} header no longer contains "${spec.expect}"`);
  }
}

/** One registration row → normalised entry, or null if the row isn't a real response. */
function readRow(ev, row) {
  const day = dayOf(row[ev.timestamp]);
  if (!day) return null;
  const entry = { day, college: college(row[ev.institution.col]), sections: [], photos: [], fee: 0, tier: '' };

  if (ev.id === 'chitrantar') {
    let n = Math.round(Number(row[ev.photoCount.col]));
    if (!ev.photoSets[n]) {
      // No usable count: pick the path whose genre cells were filled in.
      n = Number(Object.keys(ev.photoSets).find((k) => ev.photoSets[k].every((s) => text(row[s.genre]))) || 0);
    }
    for (const set of ev.photoSets[n] || []) {
      if (!text(row[set.upload]) && !text(row[set.genre])) continue;
      entry.photos.push(chitrantarTheme(row[set.genre]) || 'Other');
    }
    entry.sections = [...new Set(entry.photos)];
    entry.fee = ev.fees[n] || 0;
    entry.tier = n ? `${n} photo${n > 1 ? 's' : ''}` : 'Unknown';
  } else {
    entry.sections = ev.classify(text(row[ev.genre.col]));
    entry.fee = ev.fee(entry.sections);
    entry.tier = entry.sections.length > 1 ? 'Both' : entry.sections[0] || (ev.sections.length ? 'Other' : 'Per member');
  }
  return entry;
}

/**
 * @param {Record<string, any[][]>} sheets  eventId → rows (row 0 = headers)
 * @param {Date} now
 */
export function aggregate(sheets, now = new Date()) {
  const today = localDay(now);
  const warnings = [];
  const parsed = EVENTS.map((ev) => {
    const rows = sheets[ev.id] || [];
    if (rows.length) checkHeaders(ev, rows[0], warnings);
    const entries = rows.slice(1).map((r) => readRow(ev, r || [])).filter(Boolean);
    return { ev, entries, connected: ev.id in sheets };
  });

  // Day axis: first registration → today, every day present.
  const allDays = parsed.flatMap((p) => p.entries.map((e) => e.day)).sort();
  let start = allDays[0] || today;
  const end = allDays.length && allDays[allDays.length - 1] > today ? allDays[allDays.length - 1] : today;
  const days = [];
  for (let d = start; d <= end && days.length < 1000; d = addDays(d, 1)) days.push(d);
  const visible = days.slice(-MAX_DAYS);
  start = visible[0];
  const idx = new Map(visible.map((d, i) => [d, i]));
  const zeros = () => visible.map(() => 0);
  const yesterday = addDays(today, -1);

  const colleges = new Map();
  const events = [];
  const series = { all: { labels: [], data: [] } };

  for (const { ev, entries, connected } of parsed) {
    const daily = zeros();
    const bySection = new Map((ev.sections || []).map((s) => [s, 0]));
    const stack = new Map(); // chart series for this event
    let photos = 0;

    for (const e of entries) {
      const i = idx.get(e.day);
      if (i != null) daily[i] += 1;

      const c = colleges.get(e.college) || { name: e.college, registrations: 0, photos: 0, events: {} };
      c.registrations += 1;
      c.photos += e.photos.length;
      c.events[ev.id] = (c.events[ev.id] || 0) + 1;
      colleges.set(e.college, c);

      if (ev.id === 'chitrantar') {
        photos += e.photos.length;
        for (const theme of e.photos) {
          bySection.set(theme, (bySection.get(theme) || 0) + 1);
          if (!stack.has(theme)) stack.set(theme, zeros());
          if (i != null) stack.get(theme)[i] += 1;
        }
      } else {
        for (const s of e.sections) bySection.set(s, (bySection.get(s) || 0) + 1);
        const label = e.sections.length > 1 ? 'Both' : e.sections[0] || (ev.sections.length ? 'Other' : 'Registrations');
        if (!stack.has(label)) stack.set(label, zeros());
        if (i != null) stack.get(label)[i] += 1;
      }
    }

    const order = [...(ev.sections || []), 'Both', 'Other', 'Registrations'];
    const labels = [...stack.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    series[ev.id] = {
      metric: ev.id === 'chitrantar' ? 'photos' : 'registrations',
      labels,
      data: labels.map((l) => stack.get(l)),
    };
    series.all.labels.push(ev.name);
    series.all.data.push(daily);

    events.push({
      id: ev.id,
      name: ev.name,
      tagline: ev.tagline,
      connected,
      registrations: entries.length,
      today: entries.filter((e) => e.day === today).length,
      yesterday: entries.filter((e) => e.day === yesterday).length,
      submissions: ev.id === 'chitrantar' ? photos : null,
      both: ev.id === 'chitragati' ? entries.filter((e) => e.sections.length > 1).length : null,
      breakdown: [...bySection].map(([label, value]) => ({ label, value })),
    });
  }

  const sum = (k) => events.reduce((a, e) => a + (e[k] || 0), 0);
  const fees = feeSummary(parsed, visible, idx, today, yesterday, zeros);
  return {
    updated: now.toISOString(),
    timezone: TIMEZONE,
    today,
    totals: {
      registrations: sum('registrations'),
      submissions: sum('submissions'),
      today: sum('today'),
      yesterday: sum('yesterday'),
      colleges: colleges.size,
    },
    events,
    days: visible,
    series,
    colleges: [...colleges.values()].sort((a, b) => b.registrations - a.registrations || b.photos - a.photos || a.name.localeCompare(b.name)).slice(0, 200),
    fees,
    warnings,
  };
}

const r2 = (v) => Math.round(v * 100) / 100;

/** Fee analysis, computed from the fee option each registration chose. */
function feeSummary(parsed, days, idx, today, yesterday, zeros) {
  const daily = zeros();
  const series = { all: { labels: [], data: [] } };
  const events = parsed.map(({ ev, entries }) => {
    const evDaily = zeros();
    const tiers = new Map();
    const genres = new Map();
    const tierDaily = new Map();
    const genreDaily = new Map();
    let total = 0;
    for (const e of entries) {
      total += e.fee;
      const i = idx.get(e.day);
      if (i != null) { evDaily[i] += e.fee; daily[i] += e.fee; }
      const t = tiers.get(e.tier) || { label: e.tier, price: e.fee, count: 0, revenue: 0 };
      t.count += 1;
      t.revenue += e.fee;
      tiers.set(e.tier, t);
      if (!tierDaily.has(e.tier)) tierDaily.set(e.tier, zeros());
      if (i != null) tierDaily.get(e.tier)[i] += e.fee;
      // Genre-wise: a multi-photo / two-section fee is split equally across what it covers.
      const parts = ev.id === 'chitrantar' ? e.photos : e.sections;
      for (const g of parts) {
        genres.set(g, (genres.get(g) || 0) + e.fee / parts.length);
        if (!genreDaily.has(g)) genreDaily.set(g, zeros());
        if (i != null) genreDaily.get(g)[i] += e.fee / parts.length;
      }
    }
    const tierOrder = [...ev.priceList.map(([l]) => l), ...(ev.sections || []), 'Both', 'Other', 'Per member', 'Unknown'];
    const sortT = (a, b) => tierOrder.indexOf(a) - tierOrder.indexOf(b) || a.localeCompare(b);
    const tierLabels = [...tierDaily.keys()].sort(sortT);
    const genreLabels = [...genreDaily.keys()].sort((a, b) => (ev.sections || []).indexOf(a) - (ev.sections || []).indexOf(b));
    series[ev.id] = {
      packages: { labels: tierLabels, data: tierLabels.map((l) => tierDaily.get(l)) },
      genres: { labels: genreLabels, data: genreLabels.map((l) => genreDaily.get(l).map(r2)) },
    };
    series.all.labels.push(ev.name);
    series.all.data.push(evDaily);
    return {
      id: ev.id,
      name: ev.name,
      total,
      registrations: entries.length,
      avg: entries.length ? r2(total / entries.length) : 0,
      today: entries.filter((e) => e.day === today).reduce((a, e) => a + e.fee, 0),
      priceList: ev.priceList.map(([label, price]) => ({ label, price })),
      tiers: [...tiers.values()].sort((a, b) => sortT(a.label, b.label)),
      genres: [...genres].map(([label, revenue]) => ({ label, revenue: r2(revenue) }))
        .sort((a, b) => (ev.sections || []).indexOf(a.label) - (ev.sections || []).indexOf(b.label)),
    };
  });
  const total = events.reduce((a, e) => a + e.total, 0);
  const regs = events.reduce((a, e) => a + e.registrations, 0);
  for (const e of events) e.share = total ? r2((e.total / total) * 100) : 0;
  const last3 = daily.slice(-3);
  const best = daily.reduce((bi, v, i) => (v > daily[bi] ? i : bi), 0);
  const todayIdx = idx.get(today);
  const yIdx = idx.get(yesterday);
  return {
    total,
    today: todayIdx != null ? daily[todayIdx] : 0,
    yesterday: yIdx != null ? daily[yIdx] : 0,
    avgPerRegistration: regs ? r2(total / regs) : 0,
    runRate: last3.length ? r2(last3.reduce((a, v) => a + v, 0) / last3.length) : 0,
    bestDay: total ? { day: days[best], amount: daily[best] } : null,
    events,
    series,
  };
}
