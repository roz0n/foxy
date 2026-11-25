// ============================================================================
// marker panel: add, backdate, rename, delete, jump
// ============================================================================
const PRESETS = ['App launched', 'Onboarding visible', 'Tapped Create wallet', 'Password created', 'Wallet ready', 'Home visible'];
let recent = []; try { recent = JSON.parse(localStorage.getItem('foxy.markers.recent')) || []; } catch {}
const mkpop = $('#mkpop'), markBtn = $('#markBtn');
const api = (path, method, body) => fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

async function addMarker(label) {
  label = String(label || '').trim(); if (!label) return;
  const ago = Number($('#mkWhen').value) || 0;
  await api('/api/marker', 'POST', { label, agoMs: ago });
  recent = [label, ...recent.filter((x) => x !== label)].slice(0, 8); localStorage.setItem('foxy.markers.recent', JSON.stringify(recent));
  $('#marker').value = ''; $('#mkWhen').value = '0';
  renderMarkers(true);
}
function setMark(on, focusId) {
  if (on) setFlt(false);
  mkpop.classList.toggle('open', on); markBtn.classList.toggle('on', on); markBtn.setAttribute('aria-expanded', String(on));
  if (!on) return;
  setMenu(false); renderMarkers(true);
  requestAnimationFrame(() => {
    const el = focusId ? mkpop.querySelector(`input.mk-name[data-id="${CSS.escape(focusId)}"]`) : $('#marker');
    el?.focus(); if (focusId) el?.select();
  });
}
/** Refreshes the count badge and (unless you are typing in it) the panel contents. */
function renderMarkers(force) {
  $('#markCount').textContent = markers.length;
  $('#markCount').hidden = !markers.length;
  // the add button wears the colour the next marker will get (it lands last, after the existing ones)
  $('#mkAdd').style.setProperty('--c', PHASE_COLORS[markers.length % PHASE_COLORS.length]);
  if (!mkpop.classList.contains('open')) return;
  const used = new Set();
  $('#mkPresets').innerHTML = [...PRESETS, ...recent.filter((x) => !PRESETS.includes(x)).slice(0, 4)].filter((x) => !used.has(x) && used.add(x))
    .map((x) => `<button type="button" data-preset="${esc(x)}" title="Add &quot;${esc(x)}&quot; at the time chosen above">${esc(x)}</button>`).join('');
  const list = $('#mkList');
  // don't clobber a name being edited. Only a name field counts: a clicked trash or target button is focused too, and its row has to refresh.
  if (!force && document.activeElement?.matches('input.mk-name') && list.contains(document.activeElement)) return;
  const real = phases.filter((p) => p.marker).reverse();
  // a focused button is replaced with the rows, so keyboard focus is handed to its twin, or to the add field when its row is gone (a deleted marker)
  const fa = document.activeElement;
  const hadFocus = list.contains(fa) && fa.matches('button[data-act]');
  const focusSel = hadFocus ? `button[data-act="${fa.dataset.act}"][data-id="${CSS.escape(fa.dataset.id)}"]` : null;
  // the time column is as wide as the longest time ("+19h 05m 08s" is wider than "+4s"), so no row's time runs into its name field
  list.style.setProperty('--tw', `${Math.ceil(Math.max(...real.map((p) => `+${tf(p.start)}`.length), 4) * 7.7) + 2}px`);
  list.innerHTML = real.length ? real.map((p) => `<div class="mkrow" style="--pc:${p.color}"><i class="ph-dot"></i><span class="mk-t">+${tf(p.start)}</span>
    <input class="mk-name" data-id="${esc(p.id)}" value="${esc(p.label)}" maxlength="120" aria-label="Marker name" />
    <span class="mk-n" title="Requests made in the phase this marker starts">${p.n} req</span>
    <span class="mk-acts">${endControl(p, 'icon-btn sm') || '<span></span>'}
    <button class="icon-btn sm" data-act="only" data-id="${esc(p.id)}" aria-pressed="${ui.phase === p.id}" title="${ui.phase === p.id ? 'Show every phase again' : 'Focus on this phase'}" aria-label="Focus on phase ${esc(p.label)}">${icon('tb-focus')}</button>
    <button class="icon-btn sm" data-act="export" data-id="${esc(p.id)}" title="${esc(exportTip(p))}" aria-label="${esc(exportTip(p))}">${icon('tb-download')}</button>
    <button class="del icon-btn sm" data-act="del" data-id="${esc(p.id)}" title="Delete this marker (the phases around it merge)" aria-label="Delete marker ${esc(p.label)}">${icon('tb-trash')}</button></span></div>`).join('')
    : `<div class="mk-empty">No markers yet. Drop one whenever something happens in the app (a screen appears, you tap a button) and everything captured after it is grouped into that phase.<br><br><button type="button" id="mkLearn" class="btn">${icon('help')}<span>Show Me How It Works</span></button></div>`;
  if (hadFocus) (list.querySelector(focusSel) || $('#marker')).focus({ preventScroll: true });
}
$('#mkAdd').onclick = () => addMarker($('#marker').value);
$('#marker').onkeydown = (e) => { if (e.key === 'Enter') addMarker(e.target.value); };
$('#mkPresets').addEventListener('click', (e) => { const b = e.target.closest('button[data-preset]'); if (b) addMarker(b.dataset.preset); });
$('#mkList').addEventListener('click', (e) => {
  if (e.target.closest('#mkLearn')) { openHelp('markers'); return; }
  const b = e.target.closest('button[data-act]'); if (!b) return;
  if (b.dataset.act === 'del') api('/api/marker/' + encodeURIComponent(b.dataset.id), 'DELETE');
  else if (b.dataset.act === 'export') openExport({ kind: 'phase', id: b.dataset.id });
  else if (b.dataset.act === 'end' || b.dataset.act === 'reopen') endMarker(b.dataset.id, b.dataset.act === 'end');
  else navigate(() => { ui.phase = ui.phase === b.dataset.id ? null : b.dataset.id; tab = 'timeline'; render(); });
});
$('#mkList').addEventListener('change', (e) => { const i = e.target.closest('input.mk-name'); if (i && i.value.trim()) api('/api/marker/' + encodeURIComponent(i.dataset.id), 'PATCH', { label: i.value }); });
$('#mkList').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input.mk-name')) e.target.blur(); });
markBtn.addEventListener('click', () => setMark(!mkpop.classList.contains('open')));
$('#mkClose').onclick = () => { setMark(false); markBtn.focus(); };
$('#mkHelp').onclick = () => openHelp('markers');
// composedPath, because a list row is rebuilt while the click is still bubbling and its button would no longer sit inside the panel
document.addEventListener('click', (e) => { if (!e.composedPath().some((n) => n.matches?.('#mkpop, #markBtn, tr.phase'))) setMark(false); });
