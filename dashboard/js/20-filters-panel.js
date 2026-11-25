// ============================================================================
// filters panel: multi-select by code owner, status, method and host, plus a minimum duration
// ============================================================================
const fltpop = $('#fltpop'), fltBtn = $('#fltBtn');
const TEAM_SCOPES = [['any', 'Either', 'The call site or the code that started the request'], ['site', 'Call site', 'Only the code that made the request'], ['via', 'Started from', 'Only the code that started the flow that led to it']];
const MS_QUICK = [250, 500, 1000, 2000];
const facetLabel = (f, v) => (f.id === 'team' ? (v === NO_TEAM ? 'No team' : v) : f.id === 'status' ? STATUS_LABEL[v] || v : f.id === 'view' ? (v === VIEW_BOOT ? 'Before navigation (app start)' : v === VIEW_UNKNOWN ? 'Not reported' : v) : v);
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const miniSeg = (label, attr, items, cur) => `<div class="mini" role="group" aria-label="${esc(label)}">${items.map(([id, text, tip, cls]) => `<button type="button" ${attr}="${esc(id)}" aria-pressed="${cur === id}" class="${cls || ''}" title="${esc(tip || '')}">${esc(text)}</button>`).join('')}</div>`;

function buildFilters() {
  $('#fltBody').innerHTML = FACETS.map((f) => {
    const search = f.search ? `<label class="fsearch">${icon('search')}<input type="search" data-fq="${f.id}" placeholder="${f.search}" aria-label="${f.search}" autocomplete="off" spellcheck="false" /></label>` : '';
    const scope = f.id === 'team' ? miniSeg('Which owner to match', 'data-fscope', TEAM_SCOPES, adv.team.scope) : '';
    return `<section class="fsec" data-f="${f.id}">
    <div class="fsec-h"><span>${f.label}</span><span class="sp"></span>${miniSeg(`${f.label}: match or exclude`, 'data-fnot', [['is', 'Is', 'Show only the picked values'], ['not', 'Is not', 'Hide the picked values', 'neg']], 'is')}</div>
    <div class="fwell">${search || scope ? `<div class="fbar">${search}${scope}</div>` : ''}
    <div class="flist" data-flist="${f.id}"></div></div></section>`;
  }).join('')
    + `<section class="fsec"><div class="fsec-h"><span>Slower than</span></div><div class="fmsrow"><input id="fltMs" type="number" min="0" step="50" inputmode="numeric" placeholder="0" aria-label="Minimum duration in milliseconds" /><span>ms</span>${miniSeg('Common durations', 'data-ms', MS_QUICK.map((n) => [String(n), n >= 1000 ? `${n / 1000}s` : `${n}ms`]), '')}</div></section>`;
}

function facetList(f) {
  const s = adv[f.id], counts = new Map();
  for (const r of reqs.values()) for (const v of FACET_VALUES[f.id](r)) counts.set(v, (counts.get(v) || 0) + 1);
  for (const v of s.on) if (!counts.has(v)) counts.set(v, 0);
  if (f.id === 'status') for (const v of STATUS_ORDER) if (!counts.has(v)) counts.set(v, 0); // every kind of status is always listed, so the list never grows under you
  if (f.id === 'team') for (const v of [...allTeams, ...myTeams]) if (!counts.has(v)) counts.set(v, 0); // every team is listed, with 0 until it makes a request
  const q = (fq[f.id] || '').trim().toLowerCase();
  // A fixed order: statuses in their natural order, everything else A to Z with the "none of the above" rows last.
  // Counts, picking a row and starring a team never move anything.
  const tail = (v) => (v === NO_TEAM || v === VIEW_BOOT || v === VIEW_UNKNOWN ? 1 : 0);
  const rows = [...counts].filter(([v]) => !q || facetLabel(f, v).toLowerCase().includes(q))
    .sort((a, b) => (f.id === 'status' ? STATUS_ORDER.indexOf(a[0]) - STATUS_ORDER.indexOf(b[0]) : tail(a[0]) - tail(b[0]) || facetLabel(f, a[0]).localeCompare(facetLabel(f, b[0]), undefined, { numeric: true, sensitivity: 'base' })));
  if (!rows.length) return `<div class="fempty">${q ? 'Nothing matches that search.' : 'Nothing captured yet.'}</div>`;
  return rows.map(([v, n]) => {
    const on = s.on.has(v), label = facetLabel(f, v);
    const dot = f.id === 'team' ? `<i class="dot" style="${v === NO_TEAM ? '' : `--c:${teamColor(v)}`}"></i>` : '';
    const star = f.id === 'team' && v !== NO_TEAM ? `<button type="button" class="fstar icon-btn sm" data-star="${esc(v)}" aria-pressed="${myTeams.has(v)}" aria-label="${myTeams.has(v) ? 'Remove' : 'Add'} ${esc(v)} ${myTeams.has(v) ? 'from' : 'to'} My teams" title="${myTeams.has(v) ? 'In My teams (click to remove)' : 'Add to My teams'}">${icon(myTeams.has(v) ? 'star' : 'star-o')}</button>` : '';
    return `<div class="fopt${n ? '' : ' zero'}"><button type="button" class="fchk" role="checkbox" aria-checked="${on}" data-v="${esc(v)}" title="${esc(f.id === 'team' && v !== NO_TEAM ? `@MetaMask/${v}` : label)}"><span class="box">${icon('check')}</span>${dot}<span class="fl${f.mono ? ' mono' : ''}">${esc(label)}</span><span class="fn">${n}</span></button>${star || '<span class="fspace"></span>'}</div>`;
  }).join('');
}

/** Opens or closes the chip row, pops new chips in, and lets the last chips fade out with the row instead of vanishing first. */
let chipKeys = new Set(), chipsHtml = '', ghostTimer = 0;
function syncFltRow() {
  const row = $('#fltRow'), ghost = $('#fltGhost');
  const live = [...row.querySelectorAll('#ownerPill .ownerpill, #phasePill .ownerpill, #advPills .ownerpill')];
  const keyList = live.map((c) => { const b = c.querySelector('button'); return `${b?.id || b?.dataset.clear || ''}|${c.textContent}`; }), keys = new Set(keyList);
  live.forEach((c, i) => { if (!chipKeys.has(keyList[i])) c.classList.add('chip-in'); });
  if (live.length) { chipsHtml = live.map((c) => { const k = c.cloneNode(true); k.classList.remove('chip-in'); k.querySelectorAll('[id],[data-clear]').forEach((n) => { n.removeAttribute('id'); n.removeAttribute('data-clear'); }); return k.outerHTML; }).join(''); clearTimeout(ghostTimer); ghost.innerHTML = ''; }
  else if (chipKeys.size) { ghost.innerHTML = chipsHtml; clearTimeout(ghostTimer); ghostTimer = setTimeout(() => { ghost.innerHTML = ''; }, 380); }
  chipKeys = keys;
  row.classList.toggle('has', live.length > 0);
  row.toggleAttribute('inert', !live.length);
}
function renderAdvPills() {
  const pill = (id, k, text, full) => `<span class="ownerpill"><span class="pk">${esc(k)}</span><span class="pv" title="${esc(full)}">${esc(text)}</span><button type="button" data-clear="${id}" aria-label="Remove the ${esc(k)} filter" title="Remove">×</button></span>`;
  const out = FACETS.filter((f) => adv[f.id].on.size).map((f) => {
    const s = adv[f.id], vals = [...s.on].map((v) => facetLabel(f, v));
    const noun = f.id === 'team' ? (s.scope === 'site' ? 'Call site owner' : s.scope === 'via' ? 'Started-from owner' : 'Owner') : f.label;
    return pill(f.id, `${noun} ${s.not ? 'is not' : 'is'}`, vals.length > 2 ? `${vals.slice(0, 2).join(', ')} +${vals.length - 2}` : vals.join(', '), vals.join(', '));
  });
  if (adv.minMs) out.push(pill('ms', 'Slower than', `${adv.minMs} ms`, `${adv.minMs} ms`));
  $('#advPills').innerHTML = out.join('');
  syncFltRow();
}

/** Rebuilding the lists would drop keyboard focus, so remember which control had it and put it back. */
const fltFocusKey = () => { const a = document.activeElement; if (!a || !fltpop.contains(a)) return null; const s = a.closest('[data-f]')?.dataset.f; return a.dataset.v != null ? `[data-f="${s}"] .fchk[data-v="${CSS.escape(a.dataset.v)}"]` : a.dataset.star != null ? `[data-star="${CSS.escape(a.dataset.star)}"]` : a.dataset.preset ? `[data-preset="${a.dataset.preset}"]` : null; };

function renderFilters() {
  const n = advActive(), open = fltpop.classList.contains('open');
  $('#fltCount').textContent = n; $('#fltCount').hidden = !n;
  fltBtn.classList.toggle('on', n > 0 || open);
  renderAdvPills();
  const ms = $('#fltMs'); if (ms && document.activeElement !== ms) ms.value = adv.minMs || '';
  if (!open) return;
  const keep = fltFocusKey();
  const mine = myTeams.size && !adv.team.not && sameSet(adv.team.on, myTeams);
  const presets = [
    { id: 'mine', label: 'My teams', ic: 'star', on: mine, off: !myTeams.size, tip: myTeams.size ? `Only requests owned by ${[...myTeams].join(', ')}` : 'Star a team in the list below to build My teams' },
    { id: 'hl', label: 'Highlighted', ic: 'hl', on: ui.hl, off: !ui.hl && !highlights.size, tip: highlights.size ? 'Only the requests you highlighted' : 'Highlight a request from its open row first' },
    { id: 'slow', label: 'Slow (1s+)', on: adv.minMs === 1000, tip: 'Requests that took at least a second' },
    { id: 'srv', label: 'Server errors', on: !adv.status.not && adv.status.on.size === 1 && adv.status.on.has('5xx'), tip: 'Responses with a 5xx status' },
  ];
  $('#fltPresets').innerHTML = presets.map((p) => `<button type="button" data-preset="${p.id}" aria-pressed="${p.on}" ${p.off ? 'disabled' : ''} title="${esc(p.tip)}">${p.ic ? icon(p.ic) : ''}${p.label}</button>`).join('');
  fltpop.querySelectorAll('.fsec[data-f]').forEach((sec) => {
    const f = FACETS.find((x) => x.id === sec.dataset.f), s = adv[f.id];
    sec.classList.toggle('neg', s.not);
    sec.querySelectorAll('[data-fnot]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.fnot === 'not') === s.not)));
    sec.querySelectorAll('[data-fscope]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fscope === s.scope)));
    sec.querySelector('.flist').innerHTML = facetList(f);
  });
  fltpop.querySelectorAll('[data-ms]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.ms) === adv.minMs)));
  if (keep) fltpop.querySelector(keep)?.focus();
}

function clearAdv() {
  for (const f of FACETS) { adv[f.id].on.clear(); adv[f.id].not = false; } adv.team.scope = 'any'; adv.minMs = 0;
  fq.team = fq.view = fq.host = ''; fltpop.querySelectorAll('input[data-fq]').forEach((i) => { i.value = ''; });
}

function setFlt(on) {
  fltpop.classList.toggle('open', on); fltBtn.setAttribute('aria-expanded', String(on));
  if (on) { setMenu(false); if (mkpop.classList.contains('open')) setMark(false); }
  renderFilters();
  if (on) requestAnimationFrame(() => fltpop.querySelector('input[data-fq]')?.focus());
}

buildFilters();
fetch('/api/owners').then((r) => r.json()).then((o) => { allTeams = o.teams || []; renderFilters(); }).catch(() => {});
fltBtn.addEventListener('click', () => setFlt(!fltpop.classList.contains('open')));
fltpop.addEventListener('click', (e) => {
  const t = e.target, sec = t.closest('.fsec[data-f]')?.dataset.f; let b;
  if ((b = t.closest('.fchk'))) { const s = adv[sec].on; s.has(b.dataset.v) ? s.delete(b.dataset.v) : s.add(b.dataset.v); render(); }
  else if ((b = t.closest('.fstar'))) { myTeams.has(b.dataset.star) ? myTeams.delete(b.dataset.star) : myTeams.add(b.dataset.star); localStorage.setItem('foxy.myteams.v1', JSON.stringify([...myTeams])); renderFilters(); }
  else if ((b = t.closest('[data-fnot]'))) { adv[sec].not = b.dataset.fnot === 'not'; render(); }
  else if ((b = t.closest('[data-fscope]'))) { adv.team.scope = b.dataset.fscope; render(); }
  else if ((b = t.closest('[data-ms]'))) { const n = Number(b.dataset.ms); adv.minMs = adv.minMs === n ? 0 : n; render(); }
  else if ((b = t.closest('[data-preset]'))) {
    const id = b.dataset.preset;
    if (id === 'mine') { adv.team.on = b.getAttribute('aria-pressed') === 'true' ? new Set() : new Set(myTeams); adv.team.not = false; }
    else if (id === 'hl') ui.hl = !ui.hl;
    else if (id === 'slow') adv.minMs = adv.minMs === 1000 ? 0 : 1000;
    else if (id === 'srv') { const on = b.getAttribute('aria-pressed') === 'true'; adv.status.on = on ? new Set() : new Set(['5xx']); adv.status.not = false; }
    render();
  }
  else if (t.closest('#fltClear')) { clearAdv(); render(); }
  else if (t.closest('#fltClose')) { setFlt(false); fltBtn.focus(); }
});
fltpop.addEventListener('input', (e) => {
  if (e.target.dataset.fq) { fq[e.target.dataset.fq] = e.target.value; renderFilters(); }
  else if (e.target.id === 'fltMs') { adv.minMs = Math.max(0, Number(e.target.value) || 0); render(); }
});
$('#advPills').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-clear]'); if (!b) return;
  if (b.dataset.clear === 'ms') adv.minMs = 0; else { adv[b.dataset.clear].on.clear(); adv[b.dataset.clear].not = false; }
  render();
});
// composedPath, because a list row is rebuilt while the click is still bubbling and would no longer sit inside the panel
document.addEventListener('click', (e) => { if (fltpop.classList.contains('open') && !e.composedPath().some((n) => n === fltpop || n === fltBtn)) setFlt(false); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && fltpop.classList.contains('open')) { setFlt(false); fltBtn.focus(); }
  else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !$('#help').open && !$('#exportDlg').open) { e.preventDefault(); setFlt(!fltpop.classList.contains('open')); }
});
