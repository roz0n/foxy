// Pause holds incoming updates in a queue here; the app is still captured by the server, so nothing is lost.
let connected = false, paused = false;
const pending = [];
// Requests that arrive while paused are tagged with the pause they came from, so the timeline can draw a divider at that boundary.
const heldKeys = new Map(); // request key -> pause id
const pauses = new Map();   // pause id -> { id, at, endedAt }
let pauseSeq = 0, currentPause = null;
/** New requests waiting in the queue (not every message: responses and the hello do not count). */
const heldCount = () => {
  const keys = new Set();
  for (const m of pending) if (m.type === 'request' && !reqs.has(m.request.key)) keys.add(m.request.key);
  return keys.size;
};
function renderConn() {
  const c = $('#conn');
  let state, ic, title, badge = '';
  if (!connected) { state = 'off'; ic = 'play'; title = 'Disconnected: waiting for the Foxy server'; }
  else if (paused) {
    state = 'paused'; ic = 'play';
    const n = heldCount();
    title = n ? `Play: show ${n} request${n === 1 ? '' : 's'} that arrived while paused` : 'Play: resume live updates';
    if (n) badge = `<span class="conn-n">${n > 99 ? '99+' : n}</span>`;
  } else { state = 'running'; ic = 'pause'; title = 'Pause: hold the view (Foxy keeps recording)'; }
  c.className = `btn icon-btn conn-btn ${state}`;
  document.documentElement.classList.toggle('is-live', state === 'running'); // drives the timeline's drifting background
  c.disabled = !connected;
  c.setAttribute('aria-pressed', String(paused));
  c.setAttribute('aria-label', paused ? 'Play: resume live updates' : 'Pause: hold live updates');
  c.title = title;
  c.innerHTML = `${icon(ic)}${badge}`;
}
/** While the view is paused the logo fox stops and faces straight ahead; on play he starts looking around again. */
const fox = {
  list: [], // Rive instances, filled in by foxLogo() once the runtime has loaded
  reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches, // those users never get the looping animation
  set(playing) {
    document.querySelectorAll('.logo[data-fox]').forEach((h) => h.classList.toggle('fox-still', !playing));
    for (const r of fox.list) {
      try { if (!playing) r.pause(); else if (!fox.reduced) r.play(); } catch { /* the logo is decoration: never let it break pausing */ }
    }
  },
};
function setPaused(on) {
  if (on) currentPause = { id: ++pauseSeq, at: Date.now(), endedAt: null };
  paused = on;
  fox.set(!on);
  if (!on) {
    const p = currentPause; currentPause = null;
    const batch = pending.splice(0);
    if (p) { p.endedAt = Date.now(); if (batch.length) pauses.set(p.id, p); }
    batch.forEach((m) => applyMessage(m, p?.id));
    schedule();
  }
  renderConn();
}
$('#conn').addEventListener('click', () => setPaused(!paused));
