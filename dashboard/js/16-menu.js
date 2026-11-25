// hamburger menu (always visible)
const menuBtn = $('#menuBtn'), actions = $('#actions');
function setMenu(on) {
  actions.classList.toggle('open', on);
  menuBtn.setAttribute('aria-expanded', String(on));
  menuBtn.querySelector('use').setAttribute('href', on ? '#i-close' : '#i-menu');
}
const THEMES = [
  { id: 'dark', label: 'Dark', bg: '#050506', ac: '#8b99ff' },
  { id: 'light', label: 'Light', bg: '#f1f1f4', ac: '#4459ff' },
  { id: 'navy', label: 'Navy', bg: '#0a1020', ac: '#6e8bff' },
  { id: 'orange', label: 'Orange', bg: '#1a0f07', ac: '#f6851b' },
];
let theme = localStorage.getItem('foxy.theme.v1'); if (!THEMES.some((t) => t.id === theme)) theme = 'dark';
function renderThemes() {
  const grid = $('#themeGrid');
  if (grid.children.length) { grid.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeId === theme))); return; } // update in place so the menu stays open
  grid.innerHTML = THEMES.map((t) => `<button type="button" role="radio" class="theme-opt" data-theme-id="${t.id}" aria-checked="${t.id === theme}" title="${t.label} theme"><span class="sw" style="--sw-bg:${t.bg};--sw-ac:${t.ac}">${icon('check')}</span>${t.label}</button>`).join('');
}
function applyTheme(id) { theme = id; document.documentElement.dataset.theme = id; localStorage.setItem('foxy.theme.v1', id); renderThemes(); }
$('#themeGrid').addEventListener('click', (e) => { const b = e.target.closest('button[data-theme-id]'); if (b) applyTheme(b.dataset.themeId); });
applyTheme(theme);
function renderTimeSeg() {
  $('#timeSeg').innerHTML = TIME_MODES.map((m) => `<button type="button" data-mode="${m.id}" aria-pressed="${m.id === timeMode}" title="${m.tip}">${m.ex}</button>`).join('');
}
$('#timeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]'); if (!b) return;
  timeMode = b.dataset.mode; localStorage.setItem('foxy.time.v1', timeMode); renderTimeSeg(); renderMarkers(true); render();
});
menuBtn.addEventListener('click', () => { const on = !actions.classList.contains('open'); setMenu(on); if (on) actions.querySelector('input, button')?.focus(); });
document.addEventListener('click', (e) => { if (!e.target.closest('#actions, #menuBtn')) setMenu(false); });
actions.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.closest('#timeSeg, #themeGrid')) setTimeout(() => setMenu(false), b.id === 'export' ? 900 : 0); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && actions.classList.contains('open')) { setMenu(false); menuBtn.focus(); } });
// In the desktop app the window gets a small bridge (desktop/preload.cjs). A browser or `npm start` has none, so these stay hidden there.
if (window.foxyDesktop) {
  const showDir = async () => { const dir = await window.foxyDesktop.folder(); $('#deskDir').innerHTML = dir ? `<b>${esc(dir.split('/').pop())}</b><code title="${esc(dir)}">${esc(dir)}</code>` : '<span class="dim">No folder chosen</span>'; };
  ['#deskRow', '#deskSwitch', '#deskSep'].forEach((s) => { $(s).hidden = false; });
  menuBtn.addEventListener('click', () => { if (actions.classList.contains('open')) showDir(); });
  $('#deskSwitch').addEventListener('click', () => window.foxyDesktop.switchFolder());
}
$('#clearHl').addEventListener('click', () => {
  const n = highlights.size; if (!n) return;
  highlights.clear(); saveHighlights(); ui.hl = false; render();
  toast(`Removed ${n} highlight${n > 1 ? 's' : ''}`);
});
// Log storage: how much the request log file takes and where it is; opened with the menu so the size is current
async function showStorage() {
  try {
    const s = await (await fetch('/api/storage')).json();
    $('#storeInfo').innerHTML = `<b>${bytes(s.logBytes)}</b> <span class="dim">in the request log</span><code title="${esc(s.logFile)}">${esc(s.logFile)}</code>`;
  } catch { $('#storeInfo').textContent = 'Not available'; }
}
menuBtn.addEventListener('click', () => { if (actions.classList.contains('open')) showStorage(); });
$('#clearLog').addEventListener('click', async () => {
  try { await fetch('/api/storage/clear', { method: 'POST' }); toast('Request log emptied'); } catch { toast('Could not empty the log'); }
});
let toastTimer = 0;
function toast(text, ms = 1800) {
  const t = $('#toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
/** E: stop the running phase, or resume it if it was already stopped. Acts on the newest marker, the same one the Stop / Resume button shows. */
async function toggleLatestPhase() {
  const p = latestMarkerPhase();
  if (!p) { toast('No phase yet. Press M to start one'); return; }
  if (p.end !== Infinity && !p.ended) return;
  try {
    const res = await endMarker(p.id, p.end === Infinity);
    if (!res.ok) throw new Error(res.status);
    toast(`${p.end === Infinity ? 'Stopped' : 'Resumed'} \u201c${p.label}\u201d`);
  } catch { toast('Could not change that phase'); }
}
/** P: hold or release the live updates, like the button in the header. */
function togglePause() {
  if ($('#conn').disabled) return;
  setPaused(!paused); toast(paused ? 'Paused: holding live updates' : 'Resumed live updates');
}
// "/" focuses the filter, Esc clears it
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); $('#filter').focus(); }
  else if (e.key === 'Escape' && document.activeElement === $('#filter')) { $('#filter').value = ''; filter = ''; $('#filter').blur(); render(); }
  else if (e.key === 'Escape' && mkpop.classList.contains('open')) { setMark(false); markBtn.focus(); }
  else if (!e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !$('#help').open && !$('#exportDlg').open) {
    if (e.key === '1') { e.preventDefault(); if (tab !== 'timeline') navigate(() => { tab = 'timeline'; render(); }); }
    else if (e.key === '2') { e.preventDefault(); if (tab !== 'endpoints') navigate(() => { tab = 'endpoints'; render(); }); }
    else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setMark(true); }
    else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); if (!e.repeat) toggleLatestPhase(); }
    else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); if (!e.repeat) togglePause(); }
    else if (e.key === '?') { e.preventDefault(); openHelp(); }
    else if ((e.key === 'h' || e.key === 'H') && tab === 'timeline' && open) { e.preventDefault(); if (!e.repeat) toggleHighlight(open); }
    else if (e.key === 'Escape' && !anyPopupOpen() && (tab === 'timeline' ? open : openEp)) { e.preventDefault(); foldOpenRow(); }
  }
});
/** Something that Esc closes is showing (the menu, the markers, filters or verdict panels, or the verdict legend). */
const anyPopupOpen = () => [fltpop, actions, mkpop].some((el) => el.classList.contains('open')) || $('#vLegend').classList.contains('open');
/** Esc with nothing else to close folds the row you opened, in the tab you are on (not a step to go Back from). */
function foldOpenRow() {
  navigate(() => { if (tab === 'timeline') open = null; else openEp = null; render(); }, false);
}

$('#timeline').addEventListener('click', (e) => {
  if (chipFilter(e)) return;
  const um = e.target.closest('tr.unmarked');
  if (um) { const b = e.target.closest('[data-act="export"]'); if (b) openExport({ kind: 'phase', id: um.dataset.pid }); return; }
  const phRow = e.target.closest('tr.phase');
  if (phRow) { // header click collapses; its buttons do their own thing
    const id = phRow.dataset.pid, act = e.target.closest('[data-act]')?.dataset.act || 'toggle';
    if (act === 'toggle') { collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); render(); }
    else if (act === 'focus') { ui.phase = ui.phase === id ? null : id; render(); }
    else if (act === 'edit') setMark(true, id);
    else if (act === 'export') openExport({ kind: 'phase', id });
    else if (act === 'end' || act === 'reopen') endMarker(id, act === 'end');
    return;
  }
  const hb = e.target.closest('[data-hl]');
  if (hb) { toggleHighlight(hb.dataset.hl); return; }
  if (e.target.closest('tr.detail')) return;
  const tr = e.target.closest('tr.req'); if (!tr) return;
  const nextOpen = open === tr.dataset.k ? null : tr.dataset.k;
  navigate(() => { if (nextOpen) markEnter(nextOpen); open = nextOpen; render(); }, nextOpen !== null);
  if (open) timelineV.reveal(open, 'start'); // a row you open goes to the top, right under the header, so its detail has the room
});
$('#tabTimeline').onclick = () => navigate(() => { tab = 'timeline'; render(); });
$('#tabEndpoints').onclick = () => navigate(() => { tab = 'endpoints'; render(); });
$('#filter').oninput = (e) => { filter = e.target.value.toLowerCase(); render(); };
/** Clears the search box: the Clear search button under an empty result, or Esc while typing. */
function clearSearch() { $('#filter').value = ''; filter = ''; render(); }
document.addEventListener('click', (e) => { if (e.target.closest('[data-clear-search]')) clearSearch(); });
// Clicking anywhere outside the search box lets go of it, so it stops looking selected (the search itself stays applied).
document.addEventListener('pointerdown', (e) => { const f = $('#filter'); if (document.activeElement === f && !e.target.closest('.field.search')) f.blur(); }, true);
/** While a search is applied the field says so: a tint and how many requests it keeps. Nothing matching turns it red. */
function syncSearchField(hits, total) {
  const field = document.querySelector('.field.search'), on = Boolean(filter);
  field.classList.toggle('has-filter', on);
  field.classList.toggle('no-match', on && total > 0 && hits === 0); // red only when there is something it could have matched
  $('#fcount').hidden = !on;
  if (on) $('#fcount').textContent = `${hits} of ${total}`;
}
$('#clear').onclick = async () => { await fetch('/api/clear', { method: 'POST' }); };
$('#reset').onclick = () => { timelineGrid.reset(render); endpointsGrid.reset(render); };
