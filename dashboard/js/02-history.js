// ---- history: the browser's Back and Forward walk through where you have been --------------------------------------------
// An entry is the tab, the opened request or endpoint and the filters. render() keeps the current entry describing what is on screen
// (replaceState), and navigate() pushes a new entry for a drill-in, so Back returns to the screen exactly as it was left.
const navSnap = () => ({
  tab, open, openEp, filter, ui: { ...ui },
  adv: { ...Object.fromEntries(FACETS.map((f) => [f.id, { on: [...adv[f.id].on], not: adv[f.id].not }])), scope: adv.team.scope, minMs: adv.minMs },
});
// Both tabs scroll the same <main>, so each remembers where it was left and gets that back when you return to it.
let enterKey = null; // the row that was just opened
const markEnter = (k) => { enterKey = k; setTimeout(() => { if (enterKey === k) enterKey = null; }, 450); };
const tabScroll = { timeline: 0, endpoints: 0 }; let shownTab = tab;
let navKey = '', navHold = false, navLast = { t: 0, kind: '' };
const navBootUntil = performance.now() + 2000; // a reload restores its entry, then the capture streams back in: don't let that empty first render overwrite it
const navBooting = () => performance.now() < navBootUntil;
/** What single thing changed, so a burst of typing becomes one entry instead of one per keystroke. */
function navKind(prev, next) {
  if (!prev) return '';
  const a = JSON.parse(prev), same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  if (a.filter !== next.filter && same({ ...a, filter: 0 }, { ...next, filter: 0 })) return 'text';
  if (a.adv.minMs !== next.adv.minMs && same({ ...a, adv: { ...a.adv, minMs: 0 } }, { ...next, adv: { ...next.adv, minMs: 0 } })) return 'ms';
  return '';
}
function navWrite(push) {
  const snap = navSnap(), key = JSON.stringify(snap);
  if (key === navKey) return;
  const first = !navKey, kind = navKind(navKey, snap), now = Date.now();
  const merge = kind && navLast.kind === kind && now - navLast.t < 1500;
  navLast = { t: now, kind }; navKey = key;
  try { (push && !first && !merge ? history.pushState : history.replaceState).call(history, snap, '', '#' + tab); } catch { /* browsers rate-limit history writes; losing one is fine */ }
}
/** Any change to the tab, the open row or the filters is a step you can go Back from. */
const syncNav = () => { if (!navHold && !navBooting()) navWrite(true); };
/** Runs a change to what is on screen. With push, Back undoes it; without, it only updates the current entry. */
function navigate(change, push = true) {
  syncNav(); navHold = true;
  try { change(); } finally { navHold = false; }
  navWrite(push);
}
function navReveal() {
  if (tab === 'timeline' && open) { const row = timelineV.reveal(open, 'center'); if (row) row.classList.add('flash'); }
  else if (tab === 'endpoints' && openEp) endpointsV.reveal(openEp, 'start');
}
function applyNav(st) {
  if (!st || typeof st !== 'object' || !st.adv) return;
  navHold = true;
  try {
    tab = st.tab === 'endpoints' ? 'endpoints' : 'timeline'; open = st.open ?? null; openEp = st.openEp ?? null;
    filter = st.filter || ''; $('#filter').value = filter; Object.assign(ui, st.ui);
    for (const f of FACETS) { adv[f.id].on = new Set(st.adv[f.id]?.on || []); adv[f.id].not = Boolean(st.adv[f.id]?.not); }
    adv.team.scope = st.adv.scope || 'any'; adv.minMs = st.adv.minMs || 0;
    render();
  } finally { navHold = false; }
  navKey = JSON.stringify(navSnap()); navLast = { t: 0, kind: '' };
  requestAnimationFrame(navReveal);
}
history.scrollRestoration = 'manual'; // the browser would put its own scroll position back after a Back, on top of ours
window.addEventListener('popstate', (e) => applyNav(e.state));
