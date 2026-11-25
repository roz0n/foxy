// Formatting: HTML escaping, the time display modes, the shared time axis, durations, sizes and status pills.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sec = (ms) => (ms / 1000).toFixed(2); // plain seconds, used for markdown and clipboard text
// Time display, switchable from the menu. 'min' = 1m 23.4s, 'clock' = 01:23.40, 'sec' = 83.40s
const TIME_MODES = [{ id: 'min', ex: '1m 23.4s', tip: 'Minutes and seconds' }, { id: 'clock', ex: '01:23.40', tip: 'Clock style' }, { id: 'sec', ex: '83.40s', tip: 'Plain seconds' }];
let timeMode = localStorage.getItem('foxy.time.v1'); if (!TIME_MODES.some((m) => m.id === timeMode)) timeMode = 'min';
/** A point on the capture timeline (time since the app connected). dec = decimals on the seconds. */
function tf(ms, dec) {
  const d = dec ?? (timeMode === 'min' ? 1 : 2), k = 10 ** d;
  const total = Math.round((Math.max(0, ms) / 1000) * k) / k; // rounded once so 59.96s carries into the minute
  if (timeMode === 'sec') return `${total.toFixed(d)}s`;
  const m = Math.floor(total / 60), h = Math.floor(m / 60), mm = m % 60, rem = total - m * 60;
  const p2 = (n) => String(n).padStart(2, '0');
  if (timeMode === 'clock') {
    const ss = d ? rem.toFixed(d).padStart(3 + d, '0') : p2(Math.round(rem));
    return h ? `${h}:${p2(mm)}:${ss}` : `${p2(m)}:${ss}`;
  }
  if (!m) return `${rem.toFixed(d)}s`;
  return h ? `${h}h ${p2(mm)}m ${p2(Math.round(rem))}s` : `${m}m ${rem.toFixed(d)}s`;
}
/**
 * The shared time axis. Maps capture time (ms) to a position (0 to 100 %) on the activity strip, the Waterfall column and the call lanes.
 * It is linear, except that a long stretch with no request running is shrunk to a short break, so activity that is bunched up in a long
 * capture still gets the whole width. That only happens when it frees up a lot of room (a quarter of the width or more), so an ordinary
 * capture is drawn exactly to scale. `busy` is a list of [start, end] spans in ms; `from` and `to` are the range being shown: the whole
 * capture, or just one phase when it is filtered to.
 */
function buildAxis(busy, from, to) {
  to = Math.max(to, from + 1);
  const len = to - from, idle = Math.max(15000, len * 0.05); // a gap longer than this counts as idle time
  const clamp = (t) => Math.min(to, Math.max(from, t));
  const spans = busy.map(([a, b]) => [clamp(a), clamp(Math.max(a, b))]);
  spans.push([from, from], [to, to]);
  spans.sort((p, q) => p[0] - q[0]);
  const clusters = []; // stretches of activity: anything closer together than `idle` is one stretch
  for (const [a, b] of spans) {
    const last = clusters[clusters.length - 1];
    if (last && a - last[1] <= idle) last[1] = Math.max(last[1], b); else clusters.push([a, b]);
  }
  const active = clusters.reduce((sum, [a, b]) => sum + (b - a), 0);
  const brk = Math.min(30000, Math.max(800, active * 0.04)); // how much room a break takes, in the same units as time
  let saved = 0; for (let i = 1; i < clusters.length; i++) saved += clusters[i][0] - clusters[i - 1][1] - brk;
  if (clusters.length < 2 || saved < len * 0.25) {
    return { from, to, breaks: [], x: (t) => ((clamp(t) - from) / len) * 100, inv: (p) => from + (p / 100) * len };
  }
  const segs = []; let v = 0;
  clusters.forEach(([a, b], i) => {
    if (i) { segs.push({ idle: true, a: clusters[i - 1][1], b: a, v0: v, w: brk }); v += brk; }
    const w = Math.max(b - a, 1); segs.push({ idle: false, a, b, v0: v, w }); v += w;
  });
  const total = v;
  const at = (t) => { let g = segs[0]; for (const c of segs) { if (c.a <= t) g = c; else break; } return g; };
  return {
    from, to,
    breaks: segs.filter((g) => g.idle).map((g) => ({ x0: (g.v0 / total) * 100, x1: ((g.v0 + g.w) / total) * 100, from: g.a, to: g.b })),
    x: (t) => { t = clamp(t); const g = at(t); return ((g.v0 + (g.idle ? ((t - g.a) / (g.b - g.a)) * g.w : t - g.a)) / total) * 100; },
    inv: (p) => { const q = (p / 100) * total; let g = segs[0]; for (const c of segs) { if (c.v0 <= q) g = c; else break; } return g.idle ? g.b : Math.min(g.b, g.a + (q - g.v0)); },
  };
}
/**
 * Time labels under the strip: five ticks across it, plus a "⋯ 1h 12m" label on each break. The end ticks and the breaks are placed first;
 * a label that would touch one already placed is dropped (a break that is too narrow for its text shows just "⋯", its hatching has the tooltip).
 */
function axisLabels(W = $('#stripin')?.clientWidth || 600) {
  const dec = axis.to - axis.from < 20000 ? 1 : 0, taken = [];
  const textW = (text) => text.length * 6.4 + 8, side = (p) => (p < 4 ? 'l' : p > 96 ? 'r' : '');
  const fit = (p, w) => { // the span this label would cover, in px, or null when it overlaps one already placed
    const x = (p / 100) * W, left = side(p) === 'l' ? x : side(p) === 'r' ? x - w : x - w / 2, right = left + w;
    if (taken.some(([l, r]) => left < r + 6 && right > l - 6)) return null;
    taken.push([left, right]); return true;
  };
  const out = [];
  const tick = (p) => { const t = axis.inv(p), x = axis.x(t), text = tf(t, dec); if (fit(x, textW(text))) out.push({ x, html: `<span class="${side(x)}" style="left:${x.toFixed(2)}%">${text}</span>` }); };
  tick(0); tick(100);
  for (const g of axis.breaks) {
    const p = (g.x0 + g.x1) / 2, long = tf(g.to - g.from, 0), tip = esc(`${long} with nothing requested, shown shortened (${tf(g.from, 0)} to ${tf(g.to, 0)})`);
    for (const text of [`⋯ ${long}`, '⋯']) if (fit(p, textW(text))) { out.push({ x: p, html: `<span class="brk-l ${side(p)}" style="left:${p.toFixed(2)}%" title="${tip}">${text}</span>` }); break; }
  }
  [25, 50, 75].forEach(tick);
  return out.map((o) => o.html).join('');
}
const TIME_FIT = { min: () => tf(0), max: () => tf(99 * 60000 + 59900) }; // auto-fit bounds for time columns
/** A length of time (gaps, phase lengths): short ones stay in seconds with 2 decimals. */
const dur = (ms) => (timeMode === 'sec' || ms < 60000 ? `${(ms / 1000).toFixed(2)}s` : tf(ms));
/** How long a request took, with its unit: "212 ms", then "1.24 s" from a second up. */
const fmtMs = (ms) => (ms == null ? '' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`);
/** Status bucket (the Filters panel's Status values) for a status as shown: 200, 'error' or '…'. */
const stBucket = (s) => (s === 'error' || s === 'err' ? 'error' : s === '…' || s == null ? 'pending' : `${String(s)[0]}xx`);
/** A clickable status pill: click it to show only that kind of status (click again to clear), like the owner chips. */
const stPill = (cls, label, bucket, extra = '') => `<span class="st ${cls}" data-status="${bucket}" title="${esc(`${extra ? extra + '. ' : ''}Click to show only ${STATUS_LABEL[bucket]}`)}">${esc(label)}</span>`;
const team = (o) => String(o).replace(/^@MetaMask\//i, '');
const bytes = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
/** Copy buttons: text lives in a registry (reset every render) so large bodies never go into attributes. */
