/* Pratikriti Registrations — client.
 * No frameworks, no third-party scripts. Data is inserted as text / SVG nodes, never innerHTML. */
(() => {
  'use strict';

  // ================================================================== basics
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nf = new Intl.NumberFormat('en-IN');
  const SVGNS = 'http://www.w3.org/2000/svg';
  const POLL_MS = 60_000;
  const css = getComputedStyle(document.documentElement);
  const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5'].map((v) => css.getPropertyValue(v).trim());
  const OVERFLOW = '#5f5655';

  function h(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }
  function s(tag, attrs) {
    const node = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) node.setAttribute(k, String(v));
    return node;
  }
  const b = (t) => h('b', null, t);
  const swatch = (color) => { const i = h('i'); i.style.background = color; return i; };
  const plural = (n, one, many) => (n === 1 ? one : many || `${one}s`);
  const inr = (v) => `₹${nf.format(Math.round(v))}`;
  const inrShort = (v) => (v >= 100000 ? `₹${+(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${+(v / 1000).toFixed(1)}k` : `₹${nf.format(v)}`);
  const pct = (v, total) => (total ? `${Math.round((v / total) * 100)}%` : '0%');
  const fmtDay = (day, opts = { day: 'numeric', month: 'short' }) =>
    new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...opts }).format(new Date(`${day}T00:00:00Z`));
  const sum = (arr) => arr.reduce((a, v) => a + v, 0);

  const el = {
    gateForm: $('#gateForm'), pw: $('#pw'), pwEye: $('#pwEye'), gateError: $('#gateError'), unlock: $('#unlock'),
    app: $('#app'), bar: $('#bar'), progress: $('#progress'), status: $('#status'), statusLabel: $('#statusLabel'),
    refresh: $('#refresh'), updated: $('#updated'),
    kTotal: $('#kTotal'), kTotalSub: $('#kTotalSub'), spark: $('#spark'),
    kPhotos: $('#kPhotos'), kToday: $('#kToday'), kTodaySub: $('#kTodaySub'), kColleges: $('#kColleges'),
    events: $('#events'), colleges: $('#colleges'), moreColleges: $('#moreColleges'), empty: $('#empty'),
    feeHero: $('#feeHero'), feeShare: $('#feeShare'), feeShareLegend: $('#feeShareLegend'), feeEvents: $('#feeEvents'), feePrices: $('#feePrices'),
  };

  const S = { data: null, sig: '', busy: false, timer: 0, failures: 0, lastSync: 0, cooldown: 0, pending: false, allColleges: false, fees: null, feesUnlocked: false };

  // ================================================================== motion helpers
  // Scroll reveals: anything marked data-reveal fades/sharpens in once it enters the viewport.
  const revealIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      e.target.dispatchEvent(new CustomEvent('revealed'));
      revealIO.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  const reveal = (node) => { if (calm()) node.classList.add('is-in'); else revealIO.observe(node); };

  /** Scoreboard digits: each digit is a 0–9 strip that slides into place. */
  function roll(node, value, prefix = '') {
    const text = prefix + nf.format(Math.round(value));
    if (calm()) { node._cols = null; node.textContent = text; return; }
    let cols = node._cols;
    if (!cols || node._text?.length !== text.length) {
      node.textContent = '';
      node._sr = h('span', { class: 'sr' });
      node.append(node._sr);
      cols = [...text].map((ch) => {
        if (!/\d/.test(ch)) { node.append(h('span', { class: 'sep', 'aria-hidden': 'true' }, ch)); return null; }
        const strip = h('span', { class: 'strip-d' }, [...'0123456789'].map((d) => h('span', null, d)));
        node.append(h('span', { class: 'digit', 'aria-hidden': 'true' }, strip));
        return strip;
      });
      node._cols = cols;
      void node.offsetWidth;
    }
    node._text = text;
    node._sr.textContent = text;
    [...text].forEach((ch, i) => {
      if (!cols[i]) return;
      cols[i].style.transitionDelay = `${(text.length - 1 - i) * 70}ms`;
      cols[i].style.transform = `translateY(${-Number(ch) * 10}%)`;
    });
  }
  // Numbers below the fold roll when they scroll into view.
  const numIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const n = e.target;
      n._seen = true;
      roll(n, n._target, n._prefix);
      numIO.unobserve(n);
    }
  }, { threshold: 0.4 });
  function setNum(node, value, prefix = '') {
    node._target = value;
    node._prefix = prefix;
    if (node._seen || calm()) roll(node, value, prefix);
    else numIO.observe(node);
  }

  /** Bars fill from 0 to their width (re-runs whenever new bars are drawn). */
  function growBars(root) {
    const fills = $$('.trk i', root);
    fills.forEach((i) => i.style.setProperty('--w', '0'));
    requestAnimationFrame(() => requestAnimationFrame(() => fills.forEach((i) => i.style.setProperty('--w', i.dataset.w))));
  }
  const fillBar = (ratio, color) => {
    const i = h('i');
    i.dataset.w = Math.max(0, Math.min(1, ratio)).toFixed(4);
    if (color) i.style.background = color;
    return h('span', { class: 'trk', 'aria-hidden': 'true' }, i);
  };

  function placeSegInd(seg) {
    const ind = $('.seg-ind', seg);
    const on = $('button[aria-pressed="true"]', seg);
    if (!ind || !on) return;
    ind.style.width = `${on.offsetWidth}px`;
    ind.style.transform = `translateX(${on.offsetLeft}px)`;
  }

  // ================================================================== fee lock + session
  el.feeLock = $('#feeLock');
  el.feeContent = $('#feeContent');
  el.feeRelock = $('#feeRelock');

  function lockFees(message = '') {
    S.fees = null;
    S.feesUnlocked = false;
    el.feeContent.hidden = true;
    el.feeRelock.hidden = true;
    el.feeLock.hidden = false;
    el.gateError.textContent = message;
    el.pw.value = '';
  }
  function unlockFees(body) {
    const first = !S.feesUnlocked;
    S.fees = body.fees;
    S.feesUnlocked = true;
    el.feeLock.hidden = true;
    el.feeRelock.hidden = false;
    el.feeContent.hidden = false;
    if (first) $$('[data-reveal]', el.feeContent).forEach(reveal);
    if (S.data) renderFeesAll();
  }

  /** Fetch the protected fee figures. Quietly shows the lock when there's no valid session. */
  async function loadFees() {
    try {
      const res = await fetch('/api/fees', { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (res.status === 401) { if (S.feesUnlocked) lockFees('Your session ended. Enter the password again.'); return false; }
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || !body.fees) return false;
      unlockFees(body);
      return true;
    } catch {
      return false;
    }
  }

  el.pwEye.addEventListener('click', () => {
    const show = el.pw.type === 'password';
    el.pw.type = show ? 'text' : 'password';
    el.pwEye.setAttribute('aria-pressed', String(show));
    el.pwEye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    el.pw.focus();
  });

  el.gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = el.pw.value;
    if (!password) { wrong('Enter the password.'); return; }
    el.unlock.disabled = true;
    el.gateError.textContent = '';
    try {
      const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ password }),
      });
      if (res.status === 204) {
        el.pw.value = '';
        el.pw.blur();
        if (!(await loadFees())) wrong("Unlocked, but the fee figures couldn't load. Try refresh.");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) wrong(`Too many attempts. Try again in ${Math.ceil((body.retryAfter || 900) / 60)} min.`);
      else if (res.status === 503) wrong('The fee password has not been set up yet.');
      else wrong("That's not the password.");
    } catch {
      wrong('No connection. Try again.');
    } finally {
      el.unlock.disabled = false;
    }
  });
  function wrong(msg) {
    el.gateError.textContent = msg;
    el.feeLock.classList.remove('is-wrong');
    void el.feeLock.offsetWidth;
    el.feeLock.classList.add('is-wrong');
    try { navigator.vibrate?.(30); } catch { /* unsupported */ }
    el.pw.select();
  }

  el.feeRelock.addEventListener('click', async () => {
    try { await fetch('/api/login', { method: 'DELETE', credentials: 'same-origin' }); } catch { /* lock locally anyway */ }
    lockFees('Locked.');
  });

  // ================================================================== data sync
  function setStatus(state) {
    el.status.dataset.state = state;
    el.statusLabel.textContent = { live: 'Live', syncing: 'Sync', stale: 'Offline' }[state];
    el.refresh.classList.toggle('is-spinning', state === 'syncing');
  }

  async function sync(manual = false) {
    if (S.busy) return;
    S.busy = true;
    clearTimeout(S.timer);
    setStatus('syncing');
    try {
      const res = await fetch('/api/stats', {
        headers: { Accept: 'application/json' }, cache: manual ? 'no-cache' : 'default', signal: AbortSignal.timeout(15000),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || !Array.isArray(body.events)) {
        const err = new Error('bad');
        err.code = (body && body.error) || 'network';
        throw err;
      }
      S.failures = 0;
      S.lastSync = Date.now();
      apply(body);
      if (S.feesUnlocked) await loadFees();
      setStatus('live');
      schedule(POLL_MS + Math.random() * 8000);
    } catch (err) {
      S.failures += 1;
      setStatus('stale');
      if (!S.data) showError(err.code);
      schedule(Math.min(15000 * 2 ** (S.failures - 1), 180000));
    } finally {
      S.busy = false;
      if (manual) el.refresh.blur();
    }
  }
  function schedule(ms) {
    clearTimeout(S.timer);
    S.timer = setTimeout(() => { if (document.hidden) S.pending = true; else sync(); }, ms);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (S.pending || Date.now() - S.lastSync > POLL_MS)) { S.pending = false; sync(); }
  });
  el.refresh.addEventListener('click', () => {
    if (Date.now() < S.cooldown) return;
    S.cooldown = Date.now() + 10000;
    el.refresh.disabled = true;
    setTimeout(() => { el.refresh.disabled = false; }, 10000);
    sync(true);
  });
  function showError(code) {
    el.empty.replaceChildren(b(code === 'not_configured' ? 'Not connected yet' : "Can't reach the sheets"), 'Retrying automatically.');
    el.empty.hidden = false;
  }

  function apply(data) {
    S.data = data;
    el.empty.hidden = true;
    const time = new Intl.DateTimeFormat('en-IN', { timeZone: data.timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(data.updated));
    el.updated.textContent = `Updated ${time} IST · since ${fmtDay(data.days[0])}`;
    const sig = JSON.stringify([data.totals, data.events, data.days, data.series, data.colleges]);
    if (sig === S.sig) return;
    S.sig = sig;
    renderHero();
    renderStrip();
    regExplorer.render(true);
    renderEvents();
    renderColleges();
    renderInsights();
  }

  let feeSig = '';
  function renderFeesAll() {
    const sig = JSON.stringify(S.fees);
    if (sig === feeSig) return;
    feeSig = sig;
    renderFees();
    feeExplorer.render(true);
  }

  // ================================================================== colours (follow the entity)
  const evIndex = (id) => S.data.events.findIndex((e) => e.id === id);
  const evColor = (id) => SERIES[evIndex(id)] || OVERFLOW;
  function genreOrder(id) {
    const ev = S.data.events[evIndex(id)];
    return [...ev.breakdown.map((x) => x.label), 'Both', 'Other'];
  }
  function colorIn(order, label) {
    const i = order.indexOf(label);
    return i >= 0 && i < SERIES.length ? SERIES[i] : OVERFLOW;
  }

  // ================================================================== hero + strip
  function renderHero() {
    const d = S.data;
    roll(el.kTotal, d.totals.registrations);
    const live = d.events.filter((e) => e.registrations > 0).length;
    el.kTotalSub.replaceChildren(b(`${d.totals.today ? '+' : ''}${d.totals.today}`), ' today · ', b(`${live} of ${d.events.length}`), ' events live');

    // growth line: running total across all days
    const daily = d.days.map((_, i) => sum(d.series.all.data.map((row) => row[i])));
    let run = 0;
    const cum = daily.map((v) => (run += v));
    const max = Math.max(1, cum[cum.length - 1]);
    const n = cum.length;
    const pts = n === 1 ? [[0, cum[0]], [93, cum[0]]] : cum.map((v, i) => [(i / (n - 1)) * 93, v]);
    const yy = (v) => 96 - (v / max) * 80;
    const line = pts.map(([x, v], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${yy(v).toFixed(2)}`).join('');
    const svg = el.spark;
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.replaceChildren();
    const grad = s('linearGradient', { id: 'sparkFill', x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(s('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0.32' }), s('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '0' }));
    const defs = s('defs');
    defs.append(grad);
    const area = s('path', { d: `${line}L93,100L0,100Z`, fill: 'url(#sparkFill)' });
    const path = s('path', { class: 'line', d: line });
    svg.append(defs, area, path);
    const wrap = el.spark.parentElement;
    if (!calm()) { wrap.classList.remove('is-draw'); void wrap.offsetWidth; wrap.classList.add('is-draw'); }
    const last = pts[pts.length - 1];
    const dot = $('.spark-dot') || h('span', { class: 'spark-dot', 'aria-hidden': 'true' });
    dot.style.left = `${last[0]}%`;
    dot.style.top = `${yy(last[1])}%`;
    wrap.append(dot);
  }

  function renderStrip() {
    const t = S.data.totals;
    setNum(el.kPhotos, t.submissions);
    setNum(el.kToday, t.today);
    setNum(el.kColleges, t.colleges);
    const diff = t.today - t.yesterday;
    el.kTodaySub.replaceChildren(t.today || t.yesterday ? h('span', { class: diff > 0 ? 'up' : null }, `${diff > 0 ? '+' : ''}${diff} vs yesterday`) : 'none yet');
  }

  // ================================================================== explorer (chart + breakdown)
  /** Axis top = 4 equal, round steps (1, 2, 5 × 10ⁿ), so every gridline label is a whole number. */
  const niceMax = (v) => {
    const raw = Math.max(1, v / 4);
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((k) => k * mag).find((x) => x >= raw);
    return step * 4;
  };
  function topRounded(x, y, w, hgt, r) {
    r = Math.min(r, w / 2, hgt);
    return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
  }

  function Explorer(root, cfg) {
    const st = { scope: 'all', breakdown: 'event', mode: 'daily', model: null, chart: null, visible: false, pending: true };
    const title = h('h2');
    const sub = h('p', { class: 'panel-sub' });
    const totalNum = h('b', { class: 'roll' });
    const totalUnit = h('span');
    const scopeChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Choose events' });
    const splitSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Split by' }, h('span', { class: 'seg-ind', 'aria-hidden': 'true' }));
    const modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Chart view' }, h('span', { class: 'seg-ind', 'aria-hidden': 'true' }),
      ...[['daily', 'Daily'], ['cumulative', 'Running total']].map(([id, label]) => h('button', { type: 'button', 'data-id': id, 'aria-pressed': String(id === 'daily') }, label)));
    const legend = h('ul', { class: 'legend', 'aria-label': 'Legend' });
    const svg = s('svg', { role: 'img' });
    const tip = h('div', { class: 'tip', hidden: true });
    const plot = h('div', { class: 'plot' }, svg, tip);
    const insight = h('p', { class: 'insight' });
    const tableBtn = h('button', { class: 'link-btn', type: 'button', 'aria-expanded': 'false' }, 'View as table');
    const tableWrap = h('div', { class: 'table-wrap', hidden: true });
    const list = h('ul', { class: 'bl', 'aria-label': 'Breakdown' });
    const note = h('p', { class: 'ex-note' });

    root.append(
      h('div', { class: 'ex-head' },
        h('div', null, h('p', { class: 'eyebrow small' }, cfg.eyebrow), title, sub),
        h('p', { class: 'ex-total' }, totalNum, totalUnit)),
      h('div', { class: 'controls' },
        h('div', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'Show'), scopeChips),
        h('div', { class: 'ctl-row' },
          h('div', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'Split by'), splitSeg),
          h('div', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'View'), modeSeg))),
      legend, plot,
      h('p', { class: 'swipe-hint', 'aria-hidden': 'true' }, '← Swipe the chart to switch events →'),
      h('div', { class: 'panel-foot' }, insight, tableBtn),
      tableWrap, list, note,
    );

    root.addEventListener('revealed', () => { st.visible = true; render(true); });

    function setScope(id) {
      st.scope = id;
      const opts = cfg.splits(id).filter((o) => !o.disabled);
      if (!opts.some((o) => o.id === st.breakdown)) st.breakdown = (opts.find((o) => o.id !== 'total') || opts[0]).id;
      render(true);
    }
    function focusEvent(id) {
      st.scope = id;
      const opts = cfg.splits(id).filter((o) => !o.disabled);
      st.breakdown = (id === 'chitrantar' ? opts[0] : opts.find((o) => o.id !== 'total') || opts[0]).id;
      render(true);
      root.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });
    }

    modeSeg.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || btn.dataset.id === st.mode) return;
      st.mode = btn.dataset.id;
      $$('button', modeSeg).forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
      placeSegInd(modeSeg);
      drawChart(true);
    });
    tableBtn.addEventListener('click', () => {
      const open = tableWrap.hidden;
      tableWrap.hidden = !open;
      tableBtn.setAttribute('aria-expanded', String(open));
      tableBtn.textContent = open ? 'Hide table' : 'View as table';
      if (open) drawTable();
    });

    function controls() {
      const scopes = [['all', 'All events'], ...S.data.events.map((e) => [e.id, e.name])];
      scopeChips.replaceChildren(...scopes.map(([id, label]) => {
        const btn = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(st.scope === id) }, label);
        btn.addEventListener('click', () => { if (st.scope !== id) setScope(id); });
        return btn;
      }));
      $$('button', splitSeg).forEach((x) => x.remove());
      for (const o of cfg.splits(st.scope)) {
        const btn = h('button', { type: 'button', 'data-id': o.id, 'aria-pressed': String(o.id === st.breakdown), disabled: o.disabled || null }, o.label);
        btn.addEventListener('click', () => {
          if (o.id === st.breakdown) return;
          st.breakdown = o.id;
          render(true);
        });
        splitSeg.append(btn);
      }
      requestAnimationFrame(() => { placeSegInd(splitSeg); placeSegInd(modeSeg); });
      const active = $('.chip[aria-pressed="true"]', scopeChips);
      if (active && scopeChips.scrollWidth > scopeChips.clientWidth) {
        scopeChips.scrollTo({ left: active.offsetLeft - 16, behavior: calm() ? 'auto' : 'smooth' });
      }
    }

    function render(animate) {
      if (!S.data || (cfg.ready && !cfg.ready())) return;
      st.model = cfg.model(st.scope, st.breakdown);
      const m = st.model;
      controls();
      title.textContent = m.title;
      sub.textContent = m.sub;
      const total = sum(m.items.map((it) => sum(it.data)));
      roll(totalNum, total, m.money ? '₹' : '');
      totalUnit.textContent = m.totalUnit;
      note.textContent = m.note || '';
      note.hidden = !m.note;

      legend.replaceChildren(...m.items.map((it) => h('li', null, swatch(it.color), it.label)));
      legend.hidden = m.items.length < 2;

      // breakdown list: every slice with its value and share, so nothing depends on colour alone
      const totals = m.items.map((it) => sum(it.data));
      const maxT = Math.max(1, ...totals);
      list.replaceChildren(...m.items.map((it, k) => h('li', null,
        h('span', { class: 'lbl' }, swatch(it.color), h('span', null, it.label)),
        h('span', { class: 'val' }, m.money ? inr(totals[k]) : nf.format(totals[k])),
        h('span', { class: 'pct' }, pct(totals[k], total)),
        fillBar(totals[k] / maxT, it.color))));
      list.hidden = m.items.length < 2;
      if (st.visible || calm()) growBars(list);
      drawChart(animate && st.visible);
    }

    function drawChart(animate) {
      const m = st.model;
      const days = S.data.days;
      const cumulative = st.mode === 'cumulative';
      const values = m.items.map((it) => {
        if (!cumulative) return it.data.slice();
        let run = 0;
        return it.data.map((v) => (run += v));
      });
      const totals = days.map((_, i) => sum(values.map((v) => v[i])));
      const grow = animate && !calm();
      const W = plot.clientWidth || 320;
      const H = plot.clientHeight || 240;
      const mg = { t: 10, r: 16, b: 24, l: m.money ? 40 : 30 };
      const iw = Math.max(10, W - mg.l - mg.r);
      const ih = Math.max(10, H - mg.t - mg.b);
      const max = niceMax(Math.max(1, ...totals));
      const y = (v) => mg.t + ih - (v / max) * ih;
      const band = iw / days.length;
      const xc = (i) => mg.l + band * (i + 0.5);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('aria-label', `${m.title}. ${m.sub}`);
      if (animate && !calm()) {
        const dir = st.swipeDir || 0;
        st.swipeDir = 0;
        svg.animate([
          { opacity: 0.15, transform: `translateX(${dir * 28}px)` },
          { opacity: 1, transform: 'none' },
        ], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
      }
      svg.replaceChildren();

      const grid = s('g', { class: 'grid' });
      const axis = s('g', { class: 'axis' });
      for (let k = 0; k <= 4; k++) {
        const v = (max / 4) * k;
        const yy = Math.round(y(v)) + 0.5;
        grid.append(s('line', { x1: mg.l, x2: W - mg.r, y1: yy, y2: yy, class: k === 0 ? 'base' : null }));
        const t = s('text', { x: mg.l - 8, y: yy + 3.5, 'text-anchor': 'end' });
        t.textContent = m.money ? inrShort(v) : Number.isInteger(v) ? nf.format(v) : v.toFixed(1);
        axis.append(t);
      }
      const every = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(iw / 58))));
      days.forEach((day, i) => {
        if ((days.length - 1 - i) % every) return;
        const t = s('text', { x: xc(i), y: H - 6, 'text-anchor': 'middle' });
        t.textContent = fmtDay(day);
        axis.append(t);
      });
      const hl = s('rect', { class: 'col-hl', x: 0, y: mg.t, width: 0, height: ih, visibility: 'hidden' });
      svg.append(grid, axis, hl);

      if (!cumulative) {
        const bw = Math.max(3, Math.min(34, band * 0.62));
        const g = s('g', { class: `bars${grow ? ' is-grow' : ''}` });
        days.forEach((_, i) => {
          let base = 0;
          const segs = m.items.map((it, k) => ({ v: values[k][i], color: it.color })).filter((x) => x.v > 0);
          segs.forEach((seg, k) => {
            const y0 = y(base);
            const y1 = y(base + seg.v);
            base += seg.v;
            const gap = k > 0 ? 2 : 0;
            const hgt = Math.max(1, y0 - y1 - gap);
            const x = xc(i) - bw / 2;
            const node = k === segs.length - 1 ? s('path', { d: topRounded(x, y1, bw, hgt, 4) }) : s('rect', { x, y: y1, width: bw, height: hgt });
            node.setAttribute('fill', seg.color);
            if (grow) node.style.animationDelay = `${Math.min(i * 28, 520)}ms`;
            g.append(node);
          });
        });
        svg.append(g);
      } else {
        const g = s('g', { class: `area${grow ? ' is-grow' : ''}` });
        const top = days.map(() => 0);
        m.items.forEach((it, k) => {
          const lo = top.slice();
          const hi = lo.map((v, i) => v + values[k][i]);
          hi.forEach((v, i) => { top[i] = v; });
          if (hi.every((v, i) => v === lo[i])) return;
          let fill;
          let edge;
          if (days.length === 1) {
            fill = `M${mg.l},${y(hi[0])}H${W - mg.r}V${y(lo[0])}H${mg.l}Z`;
            edge = `M${mg.l},${y(hi[0])}H${W - mg.r}`;
          } else {
            const tp = hi.map((v, i) => `${xc(i)},${y(v)}`);
            fill = `M${tp.join('L')}L${lo.map((v, i) => `${xc(i)},${y(v)}`).reverse().join('L')}Z`;
            edge = `M${tp.join('L')}`;
          }
          g.append(s('path', { class: 'fill', d: fill, fill: it.color }), s('path', { class: 'edge', d: edge, stroke: it.color }));
        });
        svg.append(g);
      }
      const cursor = s('line', { class: 'cursor', y1: mg.t, y2: mg.t + ih, visibility: 'hidden' });
      const dots = s('g', { class: 'dots' });
      svg.append(cursor, dots);
      st.chart = { values, totals, days, band, xc, y, mg, W, hl, cursor, dots, cumulative };

      // insight line
      const daily = cumulative ? totals.map((v, i) => v - (totals[i - 1] || 0)) : totals;
      const all = sum(daily);
      const fmt = (v) => (m.money ? inr(v) : `${nf.format(v)} ${v === 1 ? m.unit[0] : m.unit[1]}`);
      if (!all) insight.textContent = 'Nothing yet.';
      else if (cumulative) insight.replaceChildren(b(fmt(all)), ` over ${days.length} ${plural(days.length, 'day')}`);
      else {
        const best = daily.indexOf(Math.max(...daily));
        insight.replaceChildren('Best day ', b(fmtDay(days[best])), ` · ${fmt(daily[best])} · avg ${m.money ? inr(all / days.length) : (all / days.length).toFixed(1)} a day`);
      }
      hideTip();
      if (!tableWrap.hidden) drawTable();
    }

    function showTip(i) {
      const c = st.chart;
      const m = st.model;
      if (!c) return;
      if (c.cumulative) {
        c.cursor.setAttribute('x1', c.xc(i));
        c.cursor.setAttribute('x2', c.xc(i));
        c.cursor.setAttribute('visibility', 'visible');
        c.dots.replaceChildren();
        let acc = 0;
        m.items.forEach((it, k) => {
          acc += c.values[k][i];
          if (c.values[k][i]) c.dots.append(s('circle', { cx: c.xc(i), cy: c.y(acc), r: 4, fill: it.color }));
        });
      } else {
        c.hl.setAttribute('x', c.mg.l + c.band * i);
        c.hl.setAttribute('width', c.band);
        c.hl.setAttribute('visibility', 'visible');
      }
      const f = (v) => (m.money ? inr(v) : nf.format(v));
      tip.replaceChildren(
        h('p', { class: 'tip-date' }, fmtDay(c.days[i], { weekday: 'short', day: 'numeric', month: 'short' })),
        h('ul', null,
          m.items.map((it, k) => h('li', null, swatch(it.color), it.label, b(f(c.values[k][i])))),
          m.items.length > 1 ? h('li', { class: 'tip-total' }, c.cumulative ? 'Total so far' : 'Total', b(f(c.totals[i]))) : null),
      );
      tip.hidden = false;
      const tw = tip.offsetWidth;
      const x = c.xc(i);
      tip.style.left = `${x + 14 + tw > c.W ? Math.max(0, x - 14 - tw) : x + 14}px`;
    }
    function hideTip() {
      tip.hidden = true;
      const c = st.chart;
      if (!c) return;
      c.hl.setAttribute('visibility', 'hidden');
      c.cursor.setAttribute('visibility', 'hidden');
      c.dots.replaceChildren();
    }
    const at = (clientX) => {
      const r = svg.getBoundingClientRect();
      const c = st.chart;
      return Math.max(0, Math.min(c.days.length - 1, Math.floor((clientX - r.left - c.mg.l) / c.band)));
    };
    plot.addEventListener('pointermove', (e) => { if (st.chart) showTip(at(e.clientX)); });
    plot.addEventListener('pointerdown', (e) => { if (st.chart) showTip(at(e.clientX)); });
    plot.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTip(); });
    // swipe the chart sideways to step through All events → each event
    let sx = null;
    let sy = 0;
    plot.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { sx = e.clientX; sy = e.clientY; } });
    plot.addEventListener('pointercancel', () => { sx = null; });
    plot.addEventListener('pointerup', (e) => {
      if (sx == null || !S.data) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) < 56 || Math.abs(dy) > 48) return;
      const scopes = ['all', ...S.data.events.map((x) => x.id)];
      const next = scopes[(scopes.indexOf(st.scope) + (dx < 0 ? 1 : -1) + scopes.length) % scopes.length];
      hideTip();
      st.swipeDir = dx < 0 ? 1 : -1;
      setScope(next);
      haptic(10);
    });
    document.addEventListener('pointerdown', (e) => { if (!plot.contains(e.target)) hideTip(); });

    function drawTable() {
      const c = st.chart;
      const m = st.model;
      const f = (v) => (m.money ? inr(v) : nf.format(v));
      const head = h('tr', null, h('th', { scope: 'col' }, 'Date'), m.items.map((it) => h('th', { scope: 'col' }, it.label)), m.items.length > 1 ? h('th', { scope: 'col' }, 'Total') : null);
      const rows = c.days.map((day, i) => h('tr', null,
        h('td', null, fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' })),
        m.items.map((_, k) => h('td', null, f(c.values[k][i]))),
        m.items.length > 1 ? h('td', null, b(f(c.totals[i]))) : null)).reverse();
      tableWrap.replaceChildren(h('table', null, h('thead', null, head), h('tbody', null, rows)));
    }

    let lastW = 0;
    new ResizeObserver(() => {
      const w = plot.clientWidth;
      if (S.data && st.model && Math.abs(w - lastW) > 2) { lastW = w; drawChart(false); placeSegInd(splitSeg); placeSegInd(modeSeg); }
    }).observe(plot);

    return { render, focusEvent, layout: () => { placeSegInd(splitSeg); placeSegInd(modeSeg); } };
  }

  // ---- registrations explorer
  const regExplorer = Explorer($('#regExplorer'), {
    eyebrow: 'Registrations',
    splits(scope) {
      if (scope === 'all') return [{ id: 'total', label: 'Total' }, { id: 'event', label: 'By event' }];
      const ev = S.data.events[evIndex(scope)];
      if (scope === 'chitrantar') {
        return [{ id: 'total', label: 'Registrations' }, { id: 'subs', label: 'Submissions' }, { id: 'genre', label: 'By theme', disabled: !ev.breakdown.length }];
      }
      return [{ id: 'total', label: 'Total' }, { id: 'genre', label: 'By genre', disabled: !ev.breakdown.length }];
    },
    model(scope, split) {
      const d = S.data;
      if (scope === 'all') {
        if (split === 'total') {
          const data = d.days.map((_, i) => sum(d.series.all.data.map((r) => r[i])));
          return { title: 'All registrations', sub: 'Every event combined, day by day', totalUnit: 'registrations', unit: ['registration', 'registrations'], items: [{ label: 'All events', color: SERIES[0], data }] };
        }
        return {
          title: 'Registrations by event', sub: 'Each event stacked, day by day', totalUnit: 'registrations', unit: ['registration', 'registrations'],
          items: d.series.all.labels.map((label, i) => ({ label, color: SERIES[i] || OVERFLOW, data: d.series.all.data[i] })),
        };
      }
      const ev = d.events[evIndex(scope)];
      if (split === 'subs') {
        const data = d.days.map((_, i) => sum(d.series.chitrantar.data.map((r) => r[i])));
        return {
          title: `${ev.name} submissions`, sub: 'Photos sent in, day by day', totalUnit: 'photos submitted', unit: ['photo', 'photos'],
          note: `${nf.format(ev.registrations)} ${plural(ev.registrations, 'registration')} sent in ${nf.format(ev.submissions)} ${plural(ev.submissions, 'photo')}: each registration can submit 1 to 3.`,
          items: [{ label: 'Submissions', color: SERIES[1], data }],
        };
      }
      if (split === 'total') {
        return { title: `${ev.name} registrations`, sub: scope === 'chitrantar' ? 'People who signed up, day by day' : `${ev.tagline} · total registrations, day by day`, totalUnit: 'registrations', unit: ['registration', 'registrations'], items: [{ label: ev.name, color: evColor(scope), data: d.series.all.data[evIndex(scope)] }] };
      }
      const src = d.series[scope];
      const order = genreOrder(scope);
      const photos = scope === 'chitrantar';
      return {
        title: photos ? `${ev.name} submissions by theme` : `${ev.name} registrations by genre`,
        sub: photos ? 'Submissions (photos) in each theme' : `${ev.tagline} · registrations per genre`,
        totalUnit: photos ? 'photos submitted' : 'registrations',
        unit: photos ? ['photo', 'photos'] : ['registration', 'registrations'],
        note: photos ? 'Counts submissions, not registrations: one registration can enter up to three themes.'
          : scope === 'chitragati' ? '"Both" registrations are shown on their own, so nobody is counted twice.' : '',
        items: src.labels.map((label, i) => ({ label, color: colorIn(order, label), data: src.data[i] })),
      };
    },
  });

  // ---- fees explorer
  const feeExplorer = Explorer($('#feeExplorer'), {
    eyebrow: 'Fees',
    ready: () => Boolean(S.fees),
    splits(scope) {
      if (scope === 'all') return [{ id: 'total', label: 'Total' }, { id: 'event', label: 'By event' }];
      const fe = S.fees.events[evIndex(scope)];
      return [
        { id: 'total', label: 'Total' },
        { id: 'package', label: 'By package', disabled: !fe.tiers.length },
        { id: 'genre', label: scope === 'chitrantar' ? 'By theme' : 'By genre', disabled: !fe.genres.length },
      ];
    },
    model(scope, split) {
      const f = S.fees;
      const base = { money: true, totalUnit: 'collected', unit: ['', ''] };
      if (scope === 'all') {
        if (split === 'total') {
          const data = S.data.days.map((_, i) => sum(f.series.all.data.map((r) => r[i])));
          return { ...base, title: 'All fees', sub: 'Every event combined, day by day', items: [{ label: 'All events', color: SERIES[0], data }] };
        }
        return { ...base, title: 'Fees by event', sub: 'Each event stacked, day by day', items: f.series.all.labels.map((label, i) => ({ label, color: SERIES[i] || OVERFLOW, data: f.series.all.data[i] })) };
      }
      const i = evIndex(scope);
      const ev = S.data.events[i];
      if (split === 'total') return { ...base, title: `${ev.name} fees`, sub: `${ev.tagline} · day by day`, items: [{ label: ev.name, color: evColor(scope), data: f.series.all.data[i] }] };
      const src = f.series[scope][split === 'package' ? 'packages' : 'genres'];
      const order = split === 'package' && scope === 'chitrantar'
        ? f.events[i].priceList.map((p) => p.label) : [...genreOrder(scope), 'Per member'];
      return {
        ...base,
        title: `${ev.name} by ${split === 'package' ? 'package' : scope === 'chitrantar' ? 'theme' : 'genre'}`,
        sub: split === 'package' ? 'What each option brought in' : 'Fees attributed to each genre',
        note: split === 'genre' ? 'Multi-photo and two-section fees are split equally across what they cover.' : '',
        items: src.labels.map((label, k) => ({ label, color: colorIn(order, label), data: src.data[k] })),
      };
    },
  });
  const explorers = [regExplorer, feeExplorer];

  // ================================================================== events overview
  /** Genre rows for an event card. Chitrantar counts submissions per theme; the others count
   *  registrations per genre, exclusive (Chitragati "Both" is its own row) so rows add up to the total. */
  function genreList(ev, photos, order) {
    if (!ev.breakdown.length) return null;
    let rows;
    if (photos) {
      rows = ev.breakdown.map((x) => ({ label: x.label, value: x.value }));
    } else {
      const src = S.data.series[ev.id];
      const totals = new Map(src.labels.map((l, i) => [l, sum(src.data[i])]));
      rows = ev.breakdown.map((x) => ({ label: x.label, value: totals.get(x.label) || 0 }));
      if (totals.get('Both')) rows.push({ label: 'Both sections', color: colorIn(order, 'Both'), value: totals.get('Both') });
      if (totals.get('Other')) rows.push({ label: 'Not specified', color: OVERFLOW, value: totals.get('Other') });
    }
    const whole = photos ? ev.submissions : ev.registrations;
    const max = Math.max(1, ...rows.map((r) => r.value));
    return h('span', { class: 'breakdown', role: 'list' },
      h('span', { class: 'bd-title' }, photos ? 'Submissions by theme' : 'Registrations by genre'),
      rows.map((r) => {
        const color = r.color || colorIn(order, r.label);
        return h('span', { class: 'brow', role: 'listitem' },
          h('span', { class: 'lbl' }, swatch(color), h('span', null, r.label)),
          h('span', { class: 'val' }, nf.format(r.value), h('small', null, pct(r.value, whole))),
          fillBar(r.value / max, color));
      }),
      photos ? null : h('span', { class: 'brow bd-total', role: 'listitem' }, h('span', { class: 'lbl' }, h('span', null, 'Total')), h('span', { class: 'val' }, nf.format(ev.registrations))));
  }

  function renderEvents() {
    const d = S.data;
    el.events.replaceChildren(...d.events.map((ev, idx) => {
      const photos = ev.id === 'chitrantar';
      const order = genreOrder(ev.id);
      const card = h('button', { class: `event${ev.connected ? '' : ' is-off'}`, type: 'button', 'data-reveal': true, 'data-d': String(idx % 2) },
        h('span', { class: 'event-top' },
          h('span', null,
            h('span', { class: 'event-idx' }, `0${idx + 1}`),
            h('span', { class: 'event-name' }, ev.name),
            h('span', { class: 'event-tag' }, ev.tagline)),
          photos ? null : h('span', { class: 'event-num' }, h('b', null, nf.format(ev.registrations)), h('span', null, `total ${plural(ev.registrations, 'registration')}`))),
        photos ? h('span', { class: 'duo' },
          h('span', { class: 'duo-cell' }, h('span', { class: 'duo-label' }, 'Registrations'), h('b', null, nf.format(ev.registrations)), h('span', { class: 'duo-sub' }, 'people signed up')),
          h('span', { class: 'duo-cell' }, h('span', { class: 'duo-label' }, 'Submissions'), h('b', null, nf.format(ev.submissions)), h('span', { class: 'duo-sub' }, 'photos sent in'))) : null,
        h('span', { class: 'event-meta' },
          h('span', { class: `pill${ev.today ? ' up' : ''}` }, photos ? 'Registrations today ' : 'Today ', b(`${ev.today ? '+' : ''}${ev.today}`)),
          photos && ev.registrations ? h('span', { class: 'pill' }, 'Avg ', b((ev.submissions / ev.registrations).toFixed(2)), ' photos each') : null),
        genreList(ev, photos, order),
        !ev.connected ? h('span', { class: 'event-note' }, 'Sheet not connected yet.')
          : ev.id === 'chitragati' && ev.both ? h('span', { class: 'event-note' }, '"Both sections" is one registration, so the rows add up to the total.')
            : ev.id === 'rongolipi' ? h('span', { class: 'event-note' }, 'Team event: teams are formed on the day.') : null,
      );
      card.style.setProperty('--accent', SERIES[idx] || OVERFLOW);
      card.setAttribute('aria-label', photos
        ? `${ev.name}: ${ev.registrations} registrations and ${ev.submissions} photo submissions. Show its chart.`
        : `${ev.name}: ${ev.registrations} total registrations. Show its chart.`);
      if (ev.connected) card.addEventListener('click', () => regExplorer.focusEvent(ev.id));
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      }, { passive: true });
      return card;
    }));
    $$('.event', el.events).forEach(reveal);
    growBars(el.events);
  }

  // ================================================================== colleges
  function renderColleges() {
    const d = S.data;
    const list = d.colleges;
    const max = Math.max(1, ...list.map((c) => c.registrations));
    const shown = S.allColleges ? list : list.slice(0, 8);
    el.colleges.replaceChildren(...shown.map((c, i) => h('li', { class: 'college' },
      h('span', { class: 'rk' }, String(i + 1).padStart(2, '0')),
      h('span', { class: 'nm' }, c.name),
      h('span', { class: 'ct' }, nf.format(c.registrations)),
      h('span', { class: 'sub' }, [
        ...d.events.filter((e) => c.events[e.id]).map((e) => `${e.name} ${c.events[e.id]}`),
        c.photos ? `${c.photos} ${plural(c.photos, 'photo')}` : null,
      ].filter(Boolean).join(' · ')),
      fillBar(c.registrations / max))));
    el.moreColleges.hidden = list.length <= 8;
    el.moreColleges.textContent = S.allColleges ? 'Show top 8' : `Show all ${list.length} colleges`;
    growBars(el.colleges);
  }
  el.moreColleges.addEventListener('click', () => { S.allColleges = !S.allColleges; renderColleges(); });

  // ================================================================== fees
  function renderFees() {
    const f = S.fees;
    const d = S.data;
    const diff = f.today - f.yesterday;
    const total = h('span', { class: 'roll' });
    el.feeHero.replaceChildren(
      h('p', { class: 'fee-label' }, 'Total fees collected'),
      h('p', { class: 'fee-total' }, h('span', { class: 'cur' }, '₹'), total),
      h('dl', { class: 'fee-grid' },
        h('div', null, h('dt', null, 'Today'), h('dd', null, inr(f.today), h('small', null, `${diff >= 0 ? '+' : '−'}${inr(Math.abs(diff))} vs yesterday`))),
        h('div', null, h('dt', null, 'Per registration'), h('dd', null, inr(f.avgPerRegistration), h('small', null, 'average'))),
        h('div', null, h('dt', null, 'Daily run rate'), h('dd', null, inr(f.runRate), h('small', null, 'avg of last 3 days'))),
        h('div', null, h('dt', null, 'Best day'), h('dd', null, f.bestDay ? inr(f.bestDay.amount) : '—', h('small', null, f.bestDay ? fmtDay(f.bestDay.day) : 'no fees yet')))),
    );
    setNum(total, f.total);

    // share of fees by event (part-to-whole)
    el.feeShare.replaceChildren(...f.events.filter((e) => e.total > 0).map((e) => {
      const seg = h('i', { title: `${e.name} ${inr(e.total)}` });
      seg.style.flex = `${e.total} 1 0`;
      seg.style.background = evColor(e.id);
      return seg;
    }));
    el.feeShare.parentElement.classList.toggle('is-empty', !f.total);
    el.feeShareLegend.replaceChildren(...f.events.map((e) => h('li', null,
      h('span', { class: 'lbl' }, swatch(evColor(e.id)), e.name),
      h('span', { class: 'val' }, inr(e.total)),
      h('span', { class: 'pct' }, `${Math.round(e.share)}%`))));

    // per-event detail
    el.feeEvents.replaceChildren(...f.events.map((e, idx) => {
      const ev = d.events[idx];
      const gOrder = genreOrder(e.id);
      const gMax = Math.max(1, ...e.genres.map((g) => g.revenue));
      const card = h('article', { class: 'fee-card', 'data-reveal': true, 'data-d': String(idx % 2) },
        h('div', { class: 'fee-card-top' },
          h('div', null, h('h3', null, e.name), h('span', { class: 'sub' }, `${e.registrations} ${plural(e.registrations, 'registration')} · avg ${inr(e.avg)}`)),
          h('div', { class: 'amt' }, h('b', null, inr(e.total)), h('span', null, `${Math.round(e.share)}% of all fees`))),
        e.tiers.length ? [
          h('h4', null, e.id === 'chitrantar' ? 'Packages' : 'By option'),
          h('table', { class: 'pk' },
            h('thead', null, h('tr', null, h('th', null, 'Option'), h('th', null, 'Price'), h('th', null, 'Count'), h('th', null, 'Fees'), h('th', null, 'Share'))),
            h('tbody', null, e.tiers.map((t) => h('tr', null,
              h('td', null, h('span', { class: 'lbl' }, t.label)),
              h('td', null, inr(t.price)),
              h('td', null, nf.format(t.count)),
              h('td', null, b(inr(t.revenue))),
              h('td', null, pct(t.revenue, e.total))))),
            h('tfoot', null, h('tr', null, h('td', null, 'Total'), h('td'), h('td', null, nf.format(e.registrations)), h('td', null, inr(e.total)), h('td', null, '100%')))),
        ] : h('p', { class: 'empty-note' }, ev.connected ? 'No fees yet.' : 'Sheet not connected yet.'),
        e.genres.length > 1 ? [
          h('h4', null, e.id === 'chitrantar' ? 'By theme' : 'By genre'),
          h('ul', { class: 'bl' }, e.genres.map((g) => h('li', null,
            h('span', { class: 'lbl' }, swatch(colorIn(gOrder, g.label)), h('span', null, g.label)),
            h('span', { class: 'val' }, inr(g.revenue)),
            h('span', { class: 'pct' }, pct(g.revenue, e.total)),
            fillBar(g.revenue / gMax, colorIn(gOrder, g.label))))),
        ] : null,
      );
      card.style.setProperty('--accent', evColor(e.id));
      return card;
    }));
    $$('.fee-card', el.feeEvents).forEach(reveal);
    $$('.fee-card .bl', el.feeEvents).forEach(growBars);

    el.feePrices.replaceChildren(...f.events.map((e) => h('div', null,
      h('dt', null, e.name),
      h('dd', null, e.priceList.map((p) => h('span', null, p.label, b(inr(p.price))))))));
  }

  // ================================================================== insights
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const BLOCKS = ['12–4a', '4–8a', '8a–12', '12–4p', '4–8p', '8p–12'];
  const hourName = (hr) => `${hr % 12 || 12} ${hr < 12 ? 'AM' : 'PM'}`;
  const ins = {
    kpis: $('#insKpis'), toggle: $('#insToggle'), more: $('#insMore'), maPlot: $('#maPlot'), maChart: $('#maChart'), maLegend: $('#maLegend'),
    hours: $('#hours'), hourNote: $('#hourNote'), weekdays: $('#weekdays'), heat: $('#heat'), compare: $('#compare'), conc: $('#conc'),
  };

  function kpiTile(label, value, sub, tone) {
    return h('div', { class: 'kpi-tile' }, h('p', { class: 'kt-label' }, label), h('p', { class: 'kt-value' }, value), h('p', { class: `kt-sub${tone ? ` ${tone}` : ''}` }, sub));
  }

  function renderInsights() {
    const I = S.data.insights;
    if (!I) return;
    const g = I.growth;
    ins.kpis.replaceChildren(
      kpiTile('Last 7 days', nf.format(I.last7), g == null ? 'first week of data' : `${g >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(g))}% vs the 7 before`, g == null ? '' : g >= 0 ? 'good' : 'bad'),
      kpiTile('Average a day', I.perDay.toFixed(1), `${I.activeDays} of ${S.data.days.length} days had sign-ups`),
      kpiTile('Peak hour', I.peakHour == null ? '—' : hourName(I.peakHour), 'most registrations land then'),
      kpiTile('Busiest day', I.peakWeekday == null ? '—' : WEEKDAYS[I.peakWeekday], 'of the week so far'),
    );
    if (ins.toggle.getAttribute('aria-expanded') === 'true') renderInsightDetails();
  }

  function renderInsightDetails() {
    const I = S.data.insights;
    const d = S.data;

    // momentum: daily bars + 7-day moving average line
    const daily = d.days.map((_, i) => sum(d.series.all.data.map((r) => r[i])));
    const W = ins.maPlot.clientWidth || 320;
    const H = ins.maPlot.clientHeight || 170;
    const m = { t: 10, r: 14, b: 22, l: 28 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const max = niceMax(Math.max(1, ...daily));
    const y = (v) => m.t + ih - (v / max) * ih;
    const band = iw / d.days.length;
    const xc = (i) => m.l + band * (i + 0.5);
    const svg = ins.maChart;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.replaceChildren();
    const grid = s('g', { class: 'grid' });
    const axis = s('g', { class: 'axis' });
    for (let k = 0; k <= 2; k++) {
      const v = (max / 2) * k;
      const yy = Math.round(y(v)) + 0.5;
      grid.append(s('line', { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: k === 0 ? 'base' : null }));
      const t = s('text', { x: m.l - 6, y: yy + 3.5, 'text-anchor': 'end' });
      t.textContent = nf.format(v);
      axis.append(t);
    }
    const every = Math.max(1, Math.ceil(d.days.length / Math.max(2, Math.floor(iw / 58))));
    d.days.forEach((day, i) => {
      if ((d.days.length - 1 - i) % every) return;
      const t = s('text', { x: xc(i), y: H - 5, 'text-anchor': 'middle' });
      t.textContent = fmtDay(day);
      axis.append(t);
    });
    const bars = s('g', { class: 'bars is-grow' });
    const bw = Math.max(3, Math.min(22, band * 0.56));
    daily.forEach((v, i) => {
      if (!v) return;
      const node = s('path', { d: topRounded(xc(i) - bw / 2, y(v), bw, Math.max(1, y(0) - y(v)), 3), fill: 'rgba(244,240,235,0.22)' });
      node.style.animationDelay = `${Math.min(i * 22, 400)}ms`;
      bars.append(node);
    });
    const pts = I.ma7.map((v, i) => `${xc(i)},${y(v)}`);
    const line = s('path', { class: 'ma-line', d: I.ma7.length > 1 ? `M${pts.join('L')}` : `M${m.l},${y(I.ma7[0])}H${W - m.r}` });
    const lastDot = s('circle', { cx: xc(I.ma7.length - 1), cy: y(I.ma7[I.ma7.length - 1]), r: 4, class: 'ma-dot' });
    svg.append(grid, axis, bars, line, lastDot);
    if (!calm()) line.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 1200, delay: 250, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
    ins.maLegend.replaceChildren(
      h('li', null, swatch('rgba(244,240,235,0.35)'), 'Daily'),
      h('li', null, swatch(SERIES[0]), '7-day average ', b(I.ma7[I.ma7.length - 1].toFixed(1))),
    );

    // hours: 24 bars
    const hMax = Math.max(1, ...I.byHour);
    ins.hours.replaceChildren(...I.byHour.map((v, hr) => {
      const bar = h('button', { class: `hr${hr === I.peakHour ? ' is-peak' : ''}`, type: 'button', role: 'listitem', 'aria-label': `${hourName(hr)}: ${v} ${plural(v, 'registration')}` },
        h('i'), hr % 6 === 0 ? h('span', null, hourName(hr).replace(' ', '')) : null);
      bar.firstChild.style.setProperty('--v', (v / hMax).toFixed(3));
      bar.firstChild.style.transitionDelay = `${hr * 18}ms`;
      bar.addEventListener('click', () => {
        $$('.hr', ins.hours).forEach((x) => x.classList.toggle('is-sel', x === bar));
        ins.hourNote.replaceChildren(b(`${hourName(hr)} – ${hourName((hr + 1) % 24)}`), ` · ${v} ${plural(v, 'registration')} (${pct(v, sum(I.byHour))})`);
      });
      return bar;
    }));
    ins.hourNote.replaceChildren(...(I.peakHour == null ? ['No timing data yet.'] : ['Most sign-ups arrive around ', b(hourName(I.peakHour)), '. Good time to post reminders.']));

    // weekdays
    const wMax = Math.max(1, ...I.byWeekday);
    ins.weekdays.replaceChildren(...I.byWeekday.map((v, i) => h('div', { class: `wd${i === I.peakWeekday ? ' is-peak' : ''}`, role: 'listitem' },
      h('span', { class: 'wd-l' }, WEEKDAYS[i]), fillBar(v / wMax, i === I.peakWeekday ? SERIES[0] : 'rgba(244,240,235,0.4)'), h('span', { class: 'wd-v' }, nf.format(v)))));

    // heat map
    const hm = Math.max(1, ...I.heat.flat());
    ins.heat.replaceChildren(
      h('thead', null, h('tr', null, h('th'), BLOCKS.map((bl) => h('th', { scope: 'col' }, bl)))),
      h('tbody', null, I.heat.map((row, wd) => h('tr', null, h('th', { scope: 'row' }, WEEKDAYS[wd]), row.map((v) => {
        const td = h('td', null, v ? String(v) : '');
        td.style.setProperty('--a', (v / hm).toFixed(3));
        if (v / hm > 0.55) td.classList.add('is-hot');
        return td;
      })))),
    );

    // compare table
    const head = ['Event', 'Total', 'Last 7d', 'vs prev', 'Per day', 'Best day', 'Active'];
    ins.compare.replaceChildren(
      h('thead', null, h('tr', null, head.map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', null, I.compare.map((c) => {
        const delta = c.last7 - c.prev7;
        return h('tr', null,
          h('th', { scope: 'row' }, h('span', { class: 'cmp-name' }, swatch(evColor(c.id)), c.name)),
          h('td', null, b(nf.format(c.registrations))),
          h('td', null, nf.format(c.last7)),
          h('td', { class: delta > 0 ? 'good' : delta < 0 ? 'bad' : null }, c.prev7 || c.last7 ? `${delta >= 0 ? '+' : ''}${delta}` : '—'),
          h('td', null, c.perDay.toFixed(1)),
          h('td', null, c.bestDay ? `${fmtDay(c.bestDay.day)} · ${c.bestDay.count}` : '—'),
          h('td', null, `${c.activeDays}d`));
      })),
    );
    const ch = I.compare.find((c) => c.id === 'chitrantar');
    if (ch && ch.photosPerEntry) ins.compare.prepend(h('caption', null, `Chitrantar entrants submit ${ch.photosPerEntry.toFixed(2)} photos on average.`));

    // concentration
    const top1 = I.topCollegeShare;
    const top3 = Math.max(top1, I.top3CollegeShare);
    const bar = h('div', { class: 'conc-bar' }, h('i'), h('i'), h('i'));
    [[top1, SERIES[0]], [top3 - top1, 'rgba(244,240,235,0.7)'], [100 - top3, 'rgba(244,240,235,0.2)']].forEach(([v, c], i) => {
      bar.children[i].style.flex = `${Math.max(0, v)} 1 0`;
      bar.children[i].style.background = c;
    });
    const lead = d.colleges[0];
    const row = (color, label, v) => h('li', null, h('span', { class: 'lbl' }, swatch(color), label), h('span', { class: 'val' }, `${Math.round(v)}%`), h('span', { class: 'pct' }));
    ins.conc.replaceChildren(
      bar,
      h('ul', { class: 'share-legend' },
        row(SERIES[0], lead ? lead.name : 'Top college', top1),
        row('rgba(244,240,235,0.7)', 'Next two colleges', top3 - top1),
        row('rgba(244,240,235,0.2)', 'Everyone else', 100 - top3)),
      h('p', { class: 'insight' }, ...(top1 >= 60
        ? ['Registrations lean heavily on ', b(lead ? lead.name : 'one college'), '. Outreach to other colleges has the most room to grow.']
        : ['Registrations are spread across colleges.'])),
    );
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ins.hours.classList.add('is-in');
      growBars(ins.weekdays);
    }));
  }

  ins.toggle.addEventListener('click', () => {
    const open = ins.toggle.getAttribute('aria-expanded') !== 'true';
    ins.toggle.setAttribute('aria-expanded', String(open));
    ins.more.classList.toggle('is-open', open);
    ins.more.inert = !open;
    haptic();
    if (open && S.data) { ins.hours.classList.remove('is-in'); requestAnimationFrame(renderInsightDetails); }
  });
  ins.more.inert = true;

  // ================================================================== mobile niceties
  function haptic(ms = 8) { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } }
  document.addEventListener('click', (e) => {
    if (e.target.closest('.chip, .seg button, .event, .dock a, .lock-again, .hr')) haptic();
  });

  // section dock: highlights the section in view
  const dock = $('#dock');
  const dockLinks = $$('a', dock);
  const dockInd = $('.dock-ind', dock);
  function placeDock(link) {
    if (!link) return;
    dockLinks.forEach((a) => a.classList.toggle('is-on', a === link));
    dockInd.style.width = `${link.offsetWidth}px`;
    dockInd.style.transform = `translateX(${link.offsetLeft}px)`;
    if (dock.scrollWidth > dock.clientWidth) dock.scrollTo({ left: link.offsetLeft - 40, behavior: calm() ? 'auto' : 'smooth' });
  }
  const sectionIO = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) placeDock(dockLinks.find((a) => a.dataset.target === e.target.id));
  }, { rootMargin: '-40% 0px -55% 0px' });
  dockLinks.forEach((a) => { const t = document.getElementById(a.dataset.target); if (t) sectionIO.observe(t); });
  dockLinks.forEach((a) => a.addEventListener('click', (e) => {
    const t = document.getElementById(a.dataset.target);
    if (!t) return;
    e.preventDefault();
    placeDock(a);
    t.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });
  }));
  requestAnimationFrame(() => placeDock(dockLinks[0]));

  // ================================================================== header scroll + boot
  let scrollQueued = false;
  function onScroll() {
    scrollQueued = false;
    const y = scrollY;
    el.bar.classList.toggle('is-scrolled', y > 8);
    dock.classList.toggle('is-shown', y > innerHeight * 0.35);
    const max = document.documentElement.scrollHeight - innerHeight;
    el.progress.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max).toFixed(4) : 0})`;
  }
  addEventListener('scroll', () => { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', () => explorers.forEach((x) => x.layout()), { passive: true });
  document.fonts?.ready.then(() => explorers.forEach((x) => x.layout()));
  document.addEventListener('touchstart', () => {}, { passive: true }); // iOS :active states

  $$('[data-reveal]').forEach(reveal);
  onScroll();
  sync();
  loadFees(); // opens the fee section straight away if this browser is already unlocked
})();
