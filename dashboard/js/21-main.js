const withId = (x) => ({ ...x, id: x.id ?? `t${x.ts}` }); // older servers did not send ids
function applyMessage(m, pauseId) {
  if (m.type === 'snapshot') { reqs.clear(); heldKeys.clear(); pauses.clear(); m.requests.forEach((r) => reqs.set(r.key, r)); markers = m.markers.map(withId); }
  else if (m.type === 'request') {
    if (pauseId != null && !reqs.has(m.request.key)) heldKeys.set(m.request.key, pauseId); // first seen while paused
    reqs.set(m.request.key, m.request);
  }
  else if (m.type === 'marker') markers.push(withId(m.marker));
  else if (m.type === 'markers') markers = m.markers.map(withId);
  else if (m.type === 'session') { reqs.clear(); heldKeys.clear(); pauses.clear(); markers = []; detailCache.clear(); }
  else if (m.type === 'relaunch') toast('The app relaunched. This capture and its markers carry on; Clear starts a fresh one', 4500);
  else if (m.type === 'cleared') { // a fresh capture: no rows, no open detail, no collapsed phases, back at the top
    reqs.clear(); heldKeys.clear(); pauses.clear(); markers = []; open = null; openEp = null; collapsed.clear(); detailCache.clear();
    highlights.clear(); saveHighlights(); ui.hl = false;
    document.querySelector('main').scrollTop = 0; tabScroll.timeline = tabScroll.endpoints = 0;
  }
}
const IMMEDIATE = new Set(['marker', 'markers', 'cleared', 'relaunch']); // messages that answer something you did, so Pause never holds them
function connect() {
  const ws = new WebSocket(`ws://${location.host}/ui`);
  ws.onopen = () => { connected = true; renderConn(); syncAudits(); };
  ws.onclose = () => { connected = false; renderConn(); setTimeout(connect, 1500); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    // Pause holds the app's traffic. What you do in the dashboard (add, rename or delete a marker, Clear) shows at once, or it looks broken.
    if (paused && !IMMEDIATE.has(m.type)) { pending.push(m); renderConn(); return; }
    if (m.type === 'cleared') { pending.length = 0; renderConn(); } // what was held belongs to the capture that was just cleared
    applyMessage(m);
    schedule();
  };
}

timelineGrid.init(render);
endpointsGrid.init(render);
renderTimeSeg();
renderConn();
connect(); render();
if (history.state?.adv) { // reload: put back the entry we were on, and scroll to the open row once the capture has streamed in
  applyNav(history.state);
  setTimeout(() => { navHold = true; try { render(); } finally { navHold = false; } navKey = JSON.stringify(navSnap()); navReveal(); }, 2050);
} else navWrite(false); // first visit: the entry Back returns to
if (localStorage.getItem('foxy.help.hide') !== '1') openHelp('start'); // shown on every launch until you tick the box
