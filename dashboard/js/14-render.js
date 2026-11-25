let auditAnim = null, auditAnimTimer = 0; // 'in' / 'out' while the Verdict column and panels are animating
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Turning audit on animates the Verdict column and panel in. Turning it off lets them fade out first, then removes them. */
function toggleAudit() {
  clearTimeout(auditAnimTimer);
  if (auditAnim === 'out') auditAnim = null; // switched back on mid-fade: just keep it
  else if (!ui.audit) { ui.audit = true; auditAnim = calm() ? null : 'in'; auditAnimTimer = setTimeout(() => { auditAnim = null; render(); }, 420); }
  else if (calm()) ui.audit = false;
  else { auditAnim = 'out'; auditAnimTimer = setTimeout(() => { ui.audit = false; auditAnim = null; render(); }, 200); }
  render(); $('#auditBtn')?.focus();
}
/** The Audit switch and Export button live in one persistent element (rebuilding it each render would stop the switch from sliding). */
function renderAuditCtl() {
  const el = $('#auditCtl'), here = Boolean(ui.phase) && tab === 'endpoints' && phases.some((p) => p.id === ui.phase);
  el.hidden = !here;
  if (!here) return;
  if (!el.firstElementChild) {
    el.innerHTML = `<span id="auditSlot" class="aud-slot" inert><span class="aud-slot-in"><button id="auditExport" type="button" aria-haspopup="dialog" title="Export this phase: audit, CSV or JSON">${icon('tb-download')}<span></span></button></span></span>`
      + '<button id="auditBtn" type="button" class="aud-switch" role="switch"><span class="aud-track"><i></i></span><span>Audit</span></button>';
  }
  const on = ui.audit && auditAnim !== 'out', sw = $('#auditBtn'), slot = $('#auditSlot');
  sw.setAttribute('aria-checked', String(on));
  sw.title = on ? 'Stop auditing this phase' : 'Audit this phase: shows the Verdict column and, in each endpoint, a verdict and reason';
  slot.classList.toggle('on', on); slot.inert = !on;
  $('#auditExport span').textContent = 'Export Audit';
}

function renderBar() {
  const all = [...reqs.values()];
  const cnt = { all: all.length, ours: 0, third: 0, unowned: 0, errors: 0, dupes: 0, hl: 0 };
  all.forEach((r) => { cnt[category(r)]++; if (isFailed(r)) cnt.errors++; if (dupeCounts.get(reqKey(r)) > 1) cnt.dupes++; if (highlights.has(r.key)) cnt.hl++; });
  document.querySelectorAll('#seg button').forEach((b) => {
    const on = ui.cat === b.dataset.cat; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); b.querySelector('.n').textContent = cnt[b.dataset.cat];
  });
  document.querySelectorAll('.tog').forEach((b) => {
    const f = b.dataset.flag; b.classList.toggle('active', ui[f]); b.setAttribute('aria-pressed', String(ui[f])); b.querySelector('.n').textContent = cnt[f];
  });
  $('#clearHl').disabled = !highlights.size;
  const o = ui.owner;
  const ph = ui.phase && phases.find((p) => p.id === ui.phase);
  $('#phasePill').innerHTML = ph ? `<span class="ownerpill">Phase ${phaseChip(ph)}<button id="phaseClear" aria-label="Show all phases" title="Show all phases">×</button></span>` : '';
  if (!(ui.audit && ph && tab === 'endpoints')) $('#vLegend').classList.remove('open');
  $('#ownerPill').innerHTML = o ? `<span class="ownerpill">${o.type === 'team' ? 'Owner' : 'Package'} ${o.type === 'team' ? teamChip(o.value) : partyChip(o.value)}<button id="ownerClear" aria-label="Clear owner filter" title="Clear">×</button></span>` : '';
  renderAuditCtl();
}

function renderStrip(list) {
  const el = $('#stripin'), W = el.clientWidth || 600;
  const N = Math.max(24, Math.min(120, Math.floor(W / 9) || 60));
  const buckets = Array.from({ length: N }, () => ({ ours: 0, third: 0, unowned: 0, first: null }));
  for (const r of list) {
    if (r.relMs < axis.from || r.relMs > axis.to) continue;
    const i = Math.min(N - 1, Math.floor((axis.x(r.relMs) / 100) * N));
    buckets[i][category(r)]++;
    if (!buckets[i].first || r.relMs < buckets[i].first.relMs) buckets[i].first = r;
  }
  const max = Math.max(1, ...buckets.map((x) => x.ours + x.third + x.unowned));
  const seg = (x, c) => (x[c] ? `<span class="${c}" style="height:${((x[c] / max) * 100).toFixed(1)}%"></span>` : '');
  const bars = buckets.map((x, i) => {
    const total = x.ours + x.third + x.unowned;
    const t0 = axis.inv((i / N) * 100), t1 = axis.inv(((i + 1) / N) * 100);
    const title = total ? `+${tf(t0)} to +${tf(t1)}: ${total} request${total > 1 ? 's' : ''} (${x.ours} owned, ${x.third} third-party, ${x.unowned} unowned)` : '';
    return `<div class="bk" ${x.first ? `data-k="${esc(x.first.key)}"` : ''} title="${esc(title)}">${seg(x, 'ours')}${seg(x, 'third')}${seg(x, 'unowned')}</div>`;
  }).join('');
  const bands = phases.filter((p) => p.start <= axis.to && Math.min(p.end, span) >= axis.from).map((p) => {
    const l = axis.x(Math.max(p.start, axis.from)), r = axis.x(Math.min(p.end === Infinity ? span : p.end, axis.to));
    return `<span class="band ${ui.phase === p.id ? 'on' : ''}" style="--pc:${p.color};left:${l.toFixed(2)}%;width:${Math.max(0, r - l).toFixed(2)}%"></span>`;
  }).join('');
  // Marker flags. Each label goes in the first row it fits without touching another, up to three rows. Near the right edge it sits on
  // the left of its line so it can never run off the window; a flag with no room left keeps its line and becomes a dot (hover for the name).
  const flags = phases.filter((p) => p.marker && p.start >= axis.from && p.start <= axis.to).map((p) => {
    const x = (axis.x(p.start) / 100) * W, w = Math.min(190, 14 + p.label.length * 5.8), flip = x + 3 + w > W - 2;
    return { p, x, w, flip, left: flip ? x - 3 - w : x + 3, lane: -1 };
  });
  const rowEnd = [-1e9, -1e9, -1e9]; let rows = 0;
  for (const f of [...flags].sort((p, q) => p.x - q.x)) {
    const k = rowEnd.findIndex((end) => f.left >= end + 4);
    if (k >= 0) { f.lane = k; rowEnd[k] = f.left + f.w; rows = Math.max(rows, k + 1); }
  }
  const flagHtml = flags.map((f) => `<span class="mk ${f.flip ? 'flip' : ''} ${f.lane < 0 ? 'dot' : ''}" style="--pc:${f.p.color};left:${axis.x(f.p.start).toFixed(2)}%;--ln:${Math.max(f.lane, 0)}"><b data-pid="${esc(f.p.id)}" title="${esc(f.p.label)} · +${tf(f.p.start)} · ${f.p.n} request${f.p.n === 1 ? '' : 's'} (click to jump to it)">${f.lane < 0 ? '' : esc(f.p.label)}</b></span>`).join('');
  const brks = axis.breaks.map((g) => `<span class="brk" style="left:${g.x0.toFixed(2)}%;width:${(g.x1 - g.x0).toFixed(2)}%" title="${esc(`${tf(g.to - g.from, 0)} with nothing requested, shown shortened`)}"></span>`).join('');
  const strip = $('.strip');
  strip.classList.toggle('has-mk', flags.length > 0);
  strip.style.setProperty('--rows', Math.max(1, rows));
  el.innerHTML = `${bands}${brks}<div class="bars">${bars}</div>${flagHtml}`;
  $('#axis').innerHTML = axisLabels();
}

function render() {
  if (tab !== shownTab) tabScroll[shownTab] = $('main').scrollTop;
  clip.length = 0;
  const all = [...reqs.values()];
  dupeCounts = new Map();
  all.forEach((r) => dupeCounts.set(reqKey(r), (dupeCounts.get(reqKey(r)) || 0) + 1));
  span = Math.max(1, all.reduce((m, r) => Math.max(m, r.relMs + (r.durationMs || 0)), 0), markers.reduce((m, x) => Math.max(m, x.relMs), 0));
  computePhases(all);
  syncSearchField(all.filter(match).length, all.length);
  if (ui.phase && !navBooting() && !phases.some((p) => p.id === ui.phase)) ui.phase = null; // its marker was deleted
  if (!ui.phase) ui.audit = false; // auditing needs a phase in focus
  syncEndpointsGrid();
  // the axis covers the whole capture, or just the phase being filtered to; breaks are decided from every request so filters never move it
  const zoom = ui.phase && phases.find((p) => p.id === ui.phase);
  axis = buildAxis([...all.map((r) => [r.relMs, r.relMs + (r.durationMs || 0)]), ...markers.map((m) => [m.relMs, m.relMs])],
    zoom ? zoom.start : 0, zoom ? (zoom.end === Infinity ? span : zoom.end) : span);
  wfMarkers = phases.filter((p) => p.marker && p.start >= axis.from && p.start <= axis.to).map((p) => `<span class="mk" style="left:${axis.x(p.start).toFixed(2)}%;background:${p.color}"></span>`).join('')
    + axis.breaks.map((g) => `<span class="brk" style="left:${g.x0.toFixed(2)}%;width:${(g.x1 - g.x0).toFixed(2)}%"></span>`).join('');
  renderBar(); renderStrip(all.filter(match)); renderMarkers(); renderFilters();
  $('#count').innerHTML = `${icon('network')}<b>${reqs.size}</b><span class="count-lbl">${reqs.size === 1 ? 'request' : 'requests'}</span>`;
  $('#timeline').hidden = tab !== 'timeline'; $('#endpoints').hidden = tab !== 'endpoints';
  $('#endpoints').classList.toggle('aud-in', auditAnim === 'in'); $('#endpoints').classList.toggle('aud-out', auditAnim === 'out');
  if (tab !== shownTab) { shownTab = tab; $('main').scrollTop = tabScroll[tab]; const el = $('#' + tab); el.classList.remove('tab-in'); void el.offsetWidth; el.classList.add('tab-in'); }
  $('#tabTimeline').classList.toggle('active', tab === 'timeline'); $('#tabEndpoints').classList.toggle('active', tab === 'endpoints');
  $('#tabTimeline').setAttribute('aria-selected', String(tab === 'timeline')); $('#tabEndpoints').setAttribute('aria-selected', String(tab === 'endpoints'));
  if (tab === 'timeline') renderTimeline();
  else if (document.activeElement?.matches?.('textarea.note')) pendingEp = true; // don't clobber a note being typed
  else renderEndpoints();
  syncNav();
}
let raf = 0; const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };

/** Clicking a team or package chip anywhere filters by it (click again to clear). */
