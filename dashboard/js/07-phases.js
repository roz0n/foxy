// ============================================================================
// markers & phases: each marker starts a phase that lasts until the next marker
// (mirrors computePhases in lib.mjs, which feeds the markdown export)
// ============================================================================
const PHASE_COLORS = ['#ff7940', '#8b99ff', '#b9f302', '#c66ef5', '#f0b034', '#ff7584', '#4cb564', '#e1a9ff'];
let phases = []; let phaseByKey = new Map();
const collapsed = new Set();
function computePhases(all) {
  phases = []; phaseByKey = new Map();
  if (!markers.length) return;
  // a marker's phase closes at its End (if ended) or at the next marker; requests after an ended phase and before the next marker are "Between phases"
  const mk = (id, label, start, end, color, marker, ended, gap) => ({ id, label, start, end, color, marker, ended, gap, n: 0, ours: 0, third: 0, unowned: 0, failed: 0, dupes: 0, newEps: 0, bytes: 0 });
  const sorted = [...markers].sort((a, b) => a.relMs - b.relMs);
  const list = [mk('pre', 'Before first marker', 0, sorted[0].relMs, '#66676a', null, false, false)];
  sorted.forEach((m, i) => {
    const nextStart = sorted[i + 1]?.relMs ?? Infinity;
    const closeAt = m.endRelMs != null ? Math.max(m.endRelMs, m.relMs) : Infinity;
    const ended = closeAt < nextStart;
    list.push(mk(m.id, m.label, m.relMs, Math.min(nextStart, closeAt), PHASE_COLORS[i % PHASE_COLORS.length], m, ended, false));
    if (ended && nextStart > closeAt) list.push(mk(`gap:${m.id}`, 'Between phases', closeAt, nextStart, '#66676a', null, false, true));
  });
  const seenEp = new Set(), seenReq = new Set();
  for (const r of [...all].sort((a, b) => a.relMs - b.relMs)) {
    let ph = list[0]; for (const p of list) if (p.start <= r.relMs) ph = p;
    phaseByKey.set(r.key, ph);
    ph.n++; ph[category(r)]++; ph.bytes += r.sizeBytes || 0; if (isFailed(r)) ph.failed++;
    const ep = `${r.method} ${r.host}${r.path}`;
    if (!seenEp.has(ep)) { seenEp.add(ep); ph.newEps++; }
    const k = dupeKey(r); if (seenReq.has(k)) ph.dupes++; else seenReq.add(k);
  }
  // a gap only shows when something was requested in it, or while it is still collecting
  const shown = list.filter((p) => !p.gap || p.n || p.end === Infinity);
  phases = shown[0].n === 0 ? shown.slice(1) : shown; // the leading phase only matters if something ran before the first marker
}
/** Ends a marker's phase where it is now, or reopens it. The server answers with a `markers` message, which redraws both places. */
const endMarker = (id, on) => api('/api/marker/' + encodeURIComponent(id) + '/end', on ? 'POST' : 'DELETE');
/** The newest marker's phase: the one that is (or was just) running, and the one the E shortcut acts on. */
const latestMarkerPhase = () => [...phases].reverse().find((x) => x.marker);
/** Only the newest marker's phase can be ended or reopened. An older one is already closed by the marker after it, and reopening it would
 *  swallow the phases in between and scramble their order. So every other phase gets nothing. */
function endControl(p, cls) {
  if (!p.marker || p !== latestMarkerPhase()) return '';
  if (p.end === Infinity) return `<button${cls ? ` class="${cls}"` : ''} data-act="end" data-id="${esc(p.id)}" title="End this phase here: anything after now is Between phases${p === latestMarkerPhase() ? ' (E)' : ''}" aria-label="End phase ${esc(p.label)}">${icon('tb-stop')}</button>`;
  if (p.ended) return `<button${cls ? ` class="${cls}"` : ''} data-act="reopen" data-id="${esc(p.id)}" title="Reopen this phase: it collects again until the next marker${p === latestMarkerPhase() ? ' (E)' : ''}" aria-label="Reopen phase ${esc(p.label)}">${icon('tb-play')}</button>`;
  return '';
}
/** What the download button says. The last phase is still collecting, so it gives what has arrived so far. */
const exportTip = (p) => `Export this phase: JSON, CSV or a markdown table${p.end === Infinity ? ' (still capturing: everything so far)' : ''}`;
/** Downloads every request of one phase, in full (headers, bodies, call chain, owners). The server does the cutting, so Pause and the filters do not change what is in the file. */
async function downloadFromServer(url, fallbackName) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || fallbackName;
  const href = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}
const phaseChip = (p) => `<span class="chip" data-phase="${esc(p.id)}" style="--c:${p.color}" title="Phase: ${esc(p.label)} (click to show only this phase)"><span class="t">${esc(p.label)}</span></span>`;
