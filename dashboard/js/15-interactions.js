function chipFilter(e) {
  const st = e.target.closest('.st[data-status]');
  if (st) { // a status pill filters by its kind of status (2xx, 4xx, Failed…) through the Filters panel's Status section
    const v = st.dataset.status, s = adv.status, only = s.on.size === 1 && s.on.has(v) && !s.not;
    s.on = only ? new Set() : new Set([v]); s.not = false; render(); return true;
  }
  const c = e.target.closest('.chip[data-team], .chip[data-pkg], .chip[data-phase]'); if (!c) return false;
  if (c.dataset.phase) { ui.phase = ui.phase === c.dataset.phase ? null : c.dataset.phase; render(); return true; }
  const next = c.dataset.team ? { type: 'team', value: team(c.dataset.team) } : { type: 'pkg', value: c.dataset.pkg };
  ui.owner = ui.owner && ui.owner.type === next.type && ui.owner.value === next.value ? null : next;
  render(); return true;
}
function openInTimeline(key) {
  const r = reqs.get(key); if (!r) return;
  navigate(() => { // Back returns to the Endpoints screen you came from
    if (!match(r)) { filter = ''; $('#filter').value = ''; ui.cat = 'all'; ui.errors = false; ui.dupes = false; ui.hl = false; ui.owner = null; ui.phase = null; clearAdv(); }
    const ph = phaseByKey.get(key); if (ph) collapsed.delete(ph.id);
    tab = 'timeline'; open = key; markEnter(key); render();
  });
  requestAnimationFrame(() => { const row = timelineV.reveal(key, 'center'); if (row) row.classList.add('flash'); });
}
$('#endpoints').addEventListener('click', (e) => {
  if (chipFilter(e)) return;
  const vb = e.target.closest('button[data-verdict]');
  if (vb) {
    const ph = auditPhase(), k = vb.closest('tr.detail').dataset.k; if (!ph) return;
    setAudit(ph, k, { v: auditOf(ph, k).v === vb.dataset.verdict ? null : vb.dataset.verdict }); render(); return;
  }
  const call = e.target.closest('[data-open]'); if (call) { openInTimeline(call.dataset.open); return; }
  if (e.target.closest('tr.detail')) return;
  const tr = e.target.closest('tr.ep'); if (!tr) return;
  const nextEp = openEp === tr.dataset.k ? null : tr.dataset.k;
  navigate(() => { if (nextEp) markEnter(nextEp); openEp = nextEp; render(); }, nextEp !== null);
  if (openEp) endpointsV.reveal(openEp, 'start'); // same as the Timeline: the opened endpoint goes to the top
});
$('#endpoints').addEventListener('input', (e) => {
  const t = e.target.closest('textarea[data-note]'); if (!t) return;
  const ph = auditPhase(); if (ph) setAudit(ph, t.dataset.note, { note: t.value });
});
$('#endpoints').addEventListener('focusout', (e) => { if (e.target.matches('textarea.note') && pendingEp) { pendingEp = false; render(); } });
$('#endpoints').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.call')) { e.preventDefault(); openInTimeline(e.target.dataset.open); }
});
$('#seg').addEventListener('click', (e) => { const b = e.target.closest('button[data-cat]'); if (b) { ui.cat = b.dataset.cat; render(); } });
document.querySelectorAll('.tog').forEach((b) => b.addEventListener('click', () => { ui[b.dataset.flag] = !ui[b.dataset.flag]; render(); }));
$('#ownerPill').addEventListener('click', (e) => { if (e.target.closest('#ownerClear')) { ui.owner = null; render(); } });
$('#vLegend dl').innerHTML = VERDICTS.map((x) => `<dt style="color:${x.c}"><i class="dot" style="background:${x.c}"></i>${x.label}</dt><dd>${esc(x.d)}<span class="ex">e.g. ${esc(x.ex)}</span></dd>`).join('');
function setVLegend(on) {
  const m = $('#vLegend'), b = $('#endpoints .vhelp');
  const open = on && Boolean(b);
  m.classList.toggle('open', open); b?.setAttribute('aria-expanded', String(open));
  if (!open) return;
  const r = b.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = `${Math.min(Math.max(8, r.right - w), innerWidth - w - 8)}px`;
  const below = r.bottom + 6, above = r.top - 6 - h; // open downward, or upward when there is no room below
  m.style.top = `${Math.max(8, below + h > innerHeight - 8 && above >= 8 ? above : Math.min(below, innerHeight - h - 8))}px`;
}
$('#endpoints').addEventListener('click', (e) => { if (e.target.closest('.vhelp')) setVLegend(!$('#vLegend').classList.contains('open')); });
document.addEventListener('click', (e) => { if ($('#vLegend').classList.contains('open') && !e.target.closest('#vLegend, .vhelp')) setVLegend(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#vLegend').classList.contains('open')) { setVLegend(false); $('#endpoints .vhelp')?.focus(); } });
addEventListener('resize', () => setVLegend(false));
addEventListener('scroll', () => { if ($('#vLegend').classList.contains('open')) setVLegend(false); }, true); // it is anchored to the button, so scrolling closes it
$('#auditCtl').addEventListener('click', (e) => {
  if (e.target.closest('#auditBtn')) toggleAudit();
  else if (e.target.closest('#auditExport') && ui.phase) openExport({ kind: 'phase', id: ui.phase });
});
$('#phasePill').addEventListener('click', (e) => {
  if (e.target.closest('#phaseClear')) { ui.phase = null; render(); }
  else chipFilter(e);
});
$('#stripin').addEventListener('click', (e) => {
  const flag = e.target.closest('b[data-pid]');
  if (flag && tab === 'endpoints') { // in Endpoints a flag focuses that phase (click again to show every phase), and stays on Endpoints
    ui.phase = ui.phase === flag.dataset.pid ? null : flag.dataset.pid; render();
    return;
  }
  if (flag) { // jump to the phase header in the Timeline
    navigate(() => { tab = 'timeline'; collapsed.delete(flag.dataset.pid); render(); });
    const row = timelineV.reveal(`phase:${flag.dataset.pid}`, 'start');
    if (row) { row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
    return;
  }
  const bk = e.target.closest('.bk[data-k]'); if (!bk) return;
  navigate(() => { tab = 'timeline'; render(); });
  const row = timelineV.reveal(bk.dataset.k, 'center'); if (!row) return;
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
});
window.addEventListener('resize', () => { timelineV.invalidate(); endpointsV.invalidate(); schedule(); });
{ const scroller = document.querySelector('main'); scroller.addEventListener('scroll', () => scroller.classList.toggle('scrolled', scroller.scrollTop > 0), { passive: true }); }
