// ---- verdicts: one per endpoint, per phase (Keep / Defer / Move / Drop and a reason). Endpoints only shows them while a phase is being audited. ----
const VERDICTS = [
  { id: 'keep', label: 'Keep', c: '#b9f302', tip: 'Needed at this point in the flow', d: 'Needed right here. Leave it.', ex: 'Feature flags this screen uses' },
  { id: 'defer', label: 'Defer', c: '#f0b034', tip: 'Not needed yet: fetch later (for example after unlock or first use)', d: 'Not needed yet. Fetch it later.', ex: 'Token prices, until the wallet opens' },
  { id: 'move', label: 'Move', c: '#8b99ff', tip: 'Needed, but should happen somewhere else in the flow', d: 'Needed, but elsewhere in the flow.', ex: 'Analytics init, after consent' },
  { id: 'drop', label: 'Drop', c: '#ff7584', tip: 'Not needed: remove it', d: 'Not needed. Remove the request.', ex: 'A duplicate or unused ping' },
];
// Stored in this browser as { [phase key]: { [endpoint]: { v, note } } }. A marker's phase key is its label, so the same flow keeps its
// verdicts across captures, and one endpoint can be Keep in one phase and Defer in another.
let audits = {}; try { audits = JSON.parse(localStorage.getItem('foxy.audit.v1')) || {}; } catch {}
const saveAudits = () => localStorage.setItem('foxy.audit.v1', JSON.stringify(audits));
const auditKey = (p) => (p.marker ? `phase:${p.label}` : p.id);
const auditOf = (p, k) => (p && audits[auditKey(p)] && audits[auditKey(p)][k]) || {};
const setAudit = (p, k, patch) => {
  const pk = auditKey(p); audits[pk] = audits[pk] || {};
  const e = { ...auditOf(p, k), ...patch, t: Date.now() };
  audits[pk][k] = e; saveAudits();
  queueAudit({ phase: pk, endpoint: k, v: e.v ?? null, note: e.note ?? '', t: e.t });
};
// The server keeps a copy of the verdicts so an agent can read them (the audit_get tool). Changes go up in small batches; if the server is not
// there they wait, and syncAudits() sends whatever it lacks the next time the dashboard connects. The newest verdict (`t`) wins on both sides.
const auditQueue = new Map(); let auditSendTimer = 0;
function queueAudit(entry) { auditQueue.set(`${entry.phase}\n${entry.endpoint}`, entry); clearTimeout(auditSendTimer); auditSendTimer = setTimeout(flushAudits, 400); }
async function flushAudits() {
  clearTimeout(auditSendTimer);
  if (!auditQueue.size) return;
  const batch = [...auditQueue.entries()]; auditQueue.clear();
  try {
    const res = await fetch('/api/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entries: batch.map(([, e]) => e) }) });
    if (!res.ok) throw new Error(res.status);
  } catch { for (const [k, e] of batch) if (!auditQueue.has(k)) auditQueue.set(k, e); throw new Error('verdicts not sent'); }
}
async function syncAudits() {
  try {
    const { audits: theirs } = await (await fetch('/api/audit')).json();
    const up = [];
    for (const pk of new Set([...Object.keys(audits), ...Object.keys(theirs)])) {
      for (const k of new Set([...Object.keys(audits[pk] || {}), ...Object.keys(theirs[pk] || {})])) {
        const mine = audits[pk]?.[k], other = theirs[pk]?.[k];
        if (mine && (!other || (mine.t ?? 0) > (other.t ?? 0))) up.push({ phase: pk, endpoint: k, v: mine.v ?? null, note: mine.note ?? '', t: mine.t ?? 0 });
        else if (other && (!mine || (other.t ?? 0) > (mine.t ?? 0))) { (audits[pk] ||= {})[k] = other; }
      }
    }
    saveAudits(); schedule();
    if (up.length) await fetch('/api/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entries: up }) });
    await flushAudits().catch(() => {});
  } catch {}
}
const auditPhase = () => (ui.audit && ui.phase ? phases.find((p) => p.id === ui.phase) : null); // the phase being audited, if any
const phaseOfGroup = (g) => phaseByKey.get(g.list[0].key);
const auditChip = (p, k) => {
  const v = VERDICTS.find((x) => x.id === auditOf(p, k).v);
  return v ? `<span class="chip" style="--c:${v.c}" title="${esc(v.tip)}"><span class="t">${v.label}</span></span>` : '<span class="aud-none">no verdict</span>';
};

const clock = (ts) => { const d = new Date(ts); return d.toLocaleTimeString([], { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0'); };
const pct = (arr, p) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)]; };
const tickCls = (r) => (r.error || r.status >= 400 ? 'bad' : r.status ? 'ok' : 'wait');
const stCls = (s) => (s === 'error' ? 'err' : /^\d/.test(s) ? 's' + s[0] : 'pending');
const statusPills = (st) => Object.entries(st).map(([s, n]) => `${stPill(`mini ${stCls(s)}`, s, stBucket(s))}${n > 1 ? `<span class="mult">×${n}</span>` : '<span class="mult"></span>'}`).join('');

/** Every call as a tick on the shared time axis; calls that repeat an earlier identical request get an orange ring. */
function lane(g, big) {
  const ticks = g.list.map((r) => `<i class="tick ${tickCls(r)} ${g.dupeIds.has(r.key) ? 'dup' : ''}" style="left:${Math.min(99.5, axis.x(r.relMs)).toFixed(2)}%" title="${esc(`#${r.id} +${tf(r.relMs)} ${r.error ? 'error' : r.status ?? 'pending'}${r.durationMs != null ? ' ' + r.durationMs + ' ms' : ''}`)}"></i>`).join('');
  return `<div class="lane ${big ? 'big' : ''}">${wfMarkers}${ticks}</div>`;
}

function buildGroups(list) {
  const groups = new Map();
  for (const r of list) {
    const k = `${r.method} ${r.host}${r.path}`;
    const g = groups.get(k) || { k, method: r.method, host: r.host, path: r.path, list: [] };
    g.list.push(r); groups.set(k, g);
  }
  return [...groups.values()].map((g) => {
    g.list.sort((a, b) => a.relMs - b.relMs);
    g.n = g.list.length; g.first = g.list[0].relMs; g.last = g.list[g.n - 1].relMs;
    g.firstAt = Math.min(...g.list.map((r) => r.ts)); g.lastAt = Math.max(...g.list.map((r) => r.ts));
    g.st = {}; g.sites = new Map(); g.byQuery = new Map(); g.dupeIds = new Set();
    g.teams = new Set(); g.pkgs = new Set(); g.via = new Set();
    g.wastedMs = 0; g.wastedBytes = 0; g.bytesTotal = 0; g.failed = 0;
    const durs = [];
    for (const r of g.list) {
      const s = r.error ? 'error' : r.status ?? '…'; g.st[s] = (g.st[s] || 0) + 1;
      if (isFailed(r)) g.failed++;
      if (r.durationMs != null) durs.push(r.durationMs);
      g.bytesTotal += r.sizeBytes || 0;
      const qk = dupeKey(r);
      if (g.byQuery.has(qk)) { g.dupeIds.add(r.key); g.wastedMs += r.durationMs || 0; g.wastedBytes += r.sizeBytes || 0; g.byQuery.get(qk).push(r); } else g.byQuery.set(qk, [r]);
      if (r.callSiteInfo) { const t = fnTitle(r.callSiteInfo); const e = g.sites.get(t) || { info: r.callSiteInfo, n: 0, owners: r.codeOwners, via: r.ownerCodeOwners }; e.n++; g.sites.set(t, e); }
      (r.codeOwners || []).forEach((o) => g.teams.add(o));
      if (!(r.codeOwners || []).length && r.callSiteInfo?.pkg) g.pkgs.add(r.callSiteInfo.kind + '|' + r.callSiteInfo.pkg);
      (r.ownerCodeOwners || []).forEach((o) => g.via.add(o));
    }
    g.teams.forEach((o) => g.via.delete(o));
    g.dupes = g.dupeIds.size;
    g.avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
    g.p95 = pct(durs, 0.95); g.max = durs.length ? Math.max(...durs) : null;
    const t = g.list.map((r) => r.relMs); let best = 1, j = 0;
    for (let i = 0; i < t.length; i++) { while (t[i] - t[j] > 1000) j++; best = Math.max(best, i - j + 1); }
    g.burst = best;
    g.chips = [...g.teams].map((o) => teamChip(o)).join('')
      + [...g.pkgs].map((x) => { const [kind, pkg] = x.split('|'); return kind === 'controller' ? extChip(pkg) : partyChip(pkg); }).join('')
      + [...g.via].map((o) => teamChip(o, true)).join('');
    g.ownerText = [...g.teams, ...g.via].map(team).join(', ') || [...g.pkgs].map((x) => x.split('|')[1]).join(', ') || 'unowned';
    return g;
  });
}

/** `GET host/path` as the method, a quiet host and the path, which is what tells endpoints apart. */
function endpointLabel(k) {
  const sp = k.indexOf(' '), method = k.slice(0, sp), rest = k.slice(sp + 1), sl = rest.indexOf('/');
  const host = sl < 0 ? rest : rest.slice(0, sl), path = sl < 0 ? '' : rest.slice(sl);
  return `<span class="verb">${esc(method)}</span> <span class="host">${esc(host)}</span><span class="path">${esc(path)}</span>`;
}
// What the endpoint is and how it behaves first, then who calls it, then where in the flow it appears.
const ENDPOINT_COLS = [
  { id: 'endpoint', label: 'Endpoint', w: 0.2, sort: (g) => g.k, cell: (g) => td(endpointLabel(g.k), { cls: 'mono', title: g.k }) },
  { id: 'statuses', label: 'Statuses', w: 0.085, sort: (g) => g.failed, sortFirst: 'desc', cell: (g) => td(statusPills(g.st)) },
  { id: 'calls', label: 'Calls', w: 0.045, fit: { min: '00', max: '000000' }, sort: (g) => g.n, sortFirst: 'desc', cell: (g) => td(g.n, { cls: 'num' }) },
  { id: 'dupes', label: 'Identical Dupes', w: 0.1, sort: (g) => g.dupes, sortFirst: 'desc', cell: (g) => td(g.dupes ? `<span class="dupe-pill l${g.dupes > 5 ? 3 : g.dupes > 2 ? 2 : 1}" title="${g.dupes} repeat${g.dupes > 1 ? 's' : ''} of an identical request (${g.wastedMs} ms, ${bytes(g.wastedBytes) || '0 B'} redundant)">+${g.dupes}</span>` : '<span class="dim">—</span>') },
  { id: 'avg', label: 'Avg Duration', w: 0.055, fit: { min: '000 ms', max: '000.0 s' }, sort: (g) => g.avg, sortFirst: 'desc', cell: (g) => td(fmtMs(g.avg), { cls: 'alt num', title: g.avg == null ? '' : `p95 ${fmtMs(g.p95)}, max ${fmtMs(g.max)}` }) },
  { id: 'sites', label: 'Call Sites', w: 0.14, sort: (g) => { const e = [...g.sites.values()][0]; return e ? `${e.info.method} ${e.info.file}` : ''; }, cell: (g) => td(`${[...g.sites.values()].slice(0, 1).map((e) => fnCell(e.info, false, { bar: false })).join('')}${g.sites.size > 1 ? `<span class="dim">+${g.sites.size - 1} more call sites</span>` : ''}`, { title: [...g.sites.values()].map((e) => fnTitle(e.info)).join('\n') }) },
  { id: 'owners', label: 'Code Owners', w: 0.13, sort: (g) => g.ownerText, cell: (g) => td(`<div class="chips">${g.chips || noneChip('—')}</div>`) },
  { id: 'phase', label: 'Phase', w: 0.1, sort: (g) => phaseByKey.get(g.list[0].key)?.start, cell: (g) => { const p = phaseByKey.get(g.list[0].key); return td(p ? `<div class="chips">${phaseChip(p)}</div>` : '<span class="dim">—</span>', { title: p ? `First called during "${p.label}"` : 'Add markers to see which phase each endpoint first appears in' }); } },
  { id: 'at', label: 'First Call At', w: 0.06, fit: CLOCK_FIT, sort: (g) => g.firstAt, cell: (g) => td(clock(g.firstAt), { cls: 'alt num', title: g.n > 1 ? `${fullTime(g.firstAt)}; last call ${fullTime(g.lastAt)}` : fullTime(g.firstAt) }) },
  { id: 'first', label: 'First', w: 0.05, fit: TIME_FIT, sort: (g) => g.first, cell: (g) => td(tf(g.first), { cls: 'alt num', title: `+${tf(g.first)} into the capture` }) },
  { id: 'activity', label: 'Activity', w: 0.12, cell: (g) => td(lane(g, false), { title: 'Every call on the capture timeline (ringed = repeat of an identical request)' }) },
];

const timelineGrid = createGrid('timeline', TIMELINE_COLS, { getSort: () => sortOf('timeline'), onSort: (c) => cycleSort('timeline', c) });
// While a phase is being audited, Endpoints gets a Verdict column for that phase. It is a separate table layout, so its widths never disturb the
// normal one. Turning audit off puts the normal grid back (see syncEndpointsGrid).
const AUDIT_COL = { id: 'verdict', label: 'Verdict', w: 0.1, sort: (g) => { const i = VERDICTS.findIndex((x) => x.id === auditOf(phaseOfGroup(g), g.k).v); return i < 0 ? null : i; }, cell: (g) => td(auditChip(phaseOfGroup(g), g.k)) };
let endpointsGrid = createGrid('endpoints', ENDPOINT_COLS, { getSort: () => sortOf('endpoints'), onSort: (c) => cycleSort('endpoints', c) });
let endpointsMode = 'plain';
const grids = { timeline: timelineGrid, endpoints: endpointsGrid };
/** Swaps the Endpoints grid between its normal columns and the audit columns (with Verdict) as the audit state changes. */
function syncEndpointsGrid() {
  const mode = ui.audit && ui.phase ? 'audit' : 'plain';
  if (mode === endpointsMode) return;
  endpointsMode = mode;
  const defs = mode === 'audit' ? [...ENDPOINT_COLS, AUDIT_COL] : ENDPOINT_COLS;
  if (sorts.endpoints && !defs.some((c) => c.id === sorts.endpoints.id)) sorts.endpoints = null;
  endpointsGrid = createGrid('endpoints', defs, { getSort: () => sortOf('endpoints'), onSort: (c) => cycleSort('endpoints', c), layout: mode === 'audit' ? 'endpoints-audit' : 'endpoints' });
  grids.endpoints = endpointsGrid;
  endpointsGrid.init(render);
}
