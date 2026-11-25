// ============================================================================
// column grid: drag header labels to reorder, drag the grips to resize
// ============================================================================
function createGrid(id, defs, { getSort, onSort, layout = id } = {}) {
  const el = $('#' + id), key = `foxy.layout.v7.${layout}`;
  const byId = Object.fromEntries(defs.map((d) => [d.id, d]));
  const isAuto = (c) => Boolean(byId[c].fit); // auto columns size themselves to their content
  const defaults = () => ({ order: defs.map((d) => d.id), widths: Object.fromEntries(defs.map((d) => [d.id, d.w])) });
  let st = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && saved.order && saved.order.length === defs.length && saved.order.every((c) => byId[c])) st = { order: saved.order, widths: { ...st.widths, ...saved.widths } };
  } catch {}
  const flex = () => st.order.filter((c) => !isAuto(c));
  const nextFlex = (i) => st.order.slice(i + 1).find((c) => !isAuto(c));
  // the shares of the resizable columns always add up to 1; they split whatever the auto columns leave over
  const normalize = () => { const f = flex(), sum = f.reduce((a, c) => a + st.widths[c], 0) || 1; f.forEach((c) => (st.widths[c] /= sum)); };
  const save = () => localStorage.setItem(key, JSON.stringify(st));

  // ---- auto-fit: measure the widest value a column holds, within a realistic range ----
  let fitPx = {};
  const ctx = document.createElement('canvas').getContext('2d');
  const fam = () => getComputedStyle(document.body).fontFamily;
  const mono = () => getComputedStyle(document.documentElement).getPropertyValue('--font-family-mono');
  const measure = (text, font) => { ctx.font = font; return ctx.measureText(String(text).replace(/\d/g, '0')).width; }; // 0 is the widest digit
  const val = (x) => (typeof x === 'function' ? x() : x);
  const tableW = () => Math.max(1100, $('main').clientWidth); // main > table has min-width: 1100px
  const autoPx = () => st.order.reduce((a, c) => a + (isAuto(c) ? fitPx[c] ?? 60 : 0), 0);
  const restPx = () => Math.max(260, tableW() - autoPx());
  function applyWidths() {
    const total = tableW(), rest = restPx();
    el.querySelectorAll('col').forEach((c) => {
      const w = isAuto(c.dataset.id) ? (fitPx[c.dataset.id] ?? 60) / total : (st.widths[c.dataset.id] * rest) / total;
      c.style.width = (w * 100).toFixed(3) + '%';
    });
  }
  /** samples: { columnId: widest text currently in that column }. Cheap enough to call on every render. */
  function fit(samples) {
    const body = `13px ${fam()}`, small = `12px ${mono()}`;
    for (const d of defs) {
      if (!d.fit) continue;
      const font = d.mono ? small : body;
      const lo = measure(val(d.fit.min) ?? '', font), hi = d.fit.max ? measure(val(d.fit.max), font) : Infinity;
      const w = Math.min(hi, Math.max(lo, measure(samples[d.id] ?? '', font)));
      const label = measure(d.label, `600 12px ${fam()}`) + 26 + (d.sort ? 15 : 0); // header label + its padding + the sort arrow
      fitPx[d.id] = Math.ceil(Math.max(w + 24, label, d.fit.minPx || 0));
    }
    applyWidths();
  }

  /** Shows the current sort in the header: the arrow, and aria-sort for screen readers. */
  function markSort() {
    const s = getSort ? getSort() : null;
    el.querySelectorAll('th').forEach((th) => {
      const on = Boolean(s) && s.id === th.dataset.id;
      th.classList.toggle('sortable', Boolean(byId[th.dataset.id].sort));
      th.classList.toggle('sort-asc', on && s.dir === 1);
      th.classList.toggle('sort-desc', on && s.dir === -1);
      th.classList.toggle('sort-implicit', on && Boolean(s.implicit));
      if (on) th.setAttribute('aria-sort', s.dir === 1 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
    });
  }

  function buildHead(onChange) {
    normalize();
    el.querySelector('colgroup').innerHTML = st.order.map((c) => `<col data-id="${c}">`).join('');
    const tr = el.querySelector('thead tr');
    tr.innerHTML = st.order.map((c, i) => `<th data-id="${c}"><span class="lbl" draggable="true" tabindex="0"${byId[c].sort ? ' role="button"' : ''} title="${byId[c].sort ? 'Click to sort, drag to reorder' : 'Drag to reorder'}">${esc(byId[c].label)}${byId[c].sort ? '<i class="sort-ind"></i>' : ''}</span>${isAuto(c) || !nextFlex(i) ? '' : `<span class="grip" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize ${esc(byId[c].label)} column" title="Drag to resize, double-click to reset"></span>`}</th>`).join('');
    applyWidths();
    markSort();

    tr.querySelectorAll('th').forEach((th, i) => {
      const colId = th.dataset.id, lbl = th.querySelector('.lbl'), grip = th.querySelector('.grip');
      // sort (a drag never produces a click, so reordering does not sort)
      if (byId[colId].sort && onSort) {
        lbl.addEventListener('click', () => onSort(colId));
        lbl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(colId); } });
      }
      // reorder
      lbl.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', colId); e.dataTransfer.effectAllowed = 'move'; th.classList.add('dragging'); });
      lbl.addEventListener('dragend', () => tr.querySelectorAll('th').forEach((t) => t.classList.remove('dragging', 'drop-left', 'drop-right')));
      th.addEventListener('dragover', (e) => { e.preventDefault(); const r = th.getBoundingClientRect(); const left = e.clientX < r.left + r.width / 2; th.classList.toggle('drop-left', left); th.classList.toggle('drop-right', !left); });
      th.addEventListener('dragleave', () => th.classList.remove('drop-left', 'drop-right'));
      th.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData('text/plain'); if (!from || from === colId) return;
        const r = th.getBoundingClientRect(); const left = e.clientX < r.left + r.width / 2;
        st.order = st.order.filter((c) => c !== from);
        const at = st.order.indexOf(colId) + (left ? 0 : 1);
        st.order.splice(at, 0, from);
        save(); buildHead(onChange); onChange();
      });
      // resize (auto columns have no grip; a resizable column trades width with the next resizable one)
      if (!grip) return;
      const nextId = nextFlex(i), MIN = 0.04;
      grip.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const a0 = st.widths[colId], b0 = st.widths[nextId];
        const a = Math.max(MIN, Math.min(a0 + (e.key === 'ArrowRight' ? 0.02 : -0.02), a0 + b0 - MIN));
        st.widths[colId] = a; st.widths[nextId] = a0 + b0 - a; applyWidths(); save();
      });
      grip.addEventListener('dblclick', () => { const d = defaults(); st.widths[colId] = d.widths[colId]; normalize(); applyWidths(); save(); });
      grip.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX, a0 = st.widths[colId], b0 = st.widths[nextId], rest = restPx();
        grip.classList.add('active'); document.body.classList.add('resizing');
        const move = (ev) => {
          const a = Math.max(MIN, Math.min(a0 + (ev.clientX - startX) / rest, a0 + b0 - MIN)); // neighbour absorbs the change
          st.widths[colId] = a; st.widths[nextId] = a0 + b0 - a; applyWidths();
        };
        const up = () => { grip.classList.remove('active'); document.body.classList.remove('resizing'); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); save(); };
        document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
      });
    });
  }
  return {
    byId, el, fit, markSort,
    order: () => st.order,
    colspan: () => st.order.length,
    init: (onChange) => buildHead(onChange),
    reset: (onChange) => { st = defaults(); save(); buildHead(onChange); onChange(); },
  };
}

const td = (inner, { cls = '', title = '' } = {}) => `<td class="${cls}" title="${esc(title)}">${inner}</td>`;

const waterfallCell = (r) => {
  const x0 = axis.x(r.relMs), left = Math.min(99, x0);
  const width = r.durationMs != null ? Math.max(0.5, axis.x(r.relMs + r.durationMs) - x0) : 0.8;
  const cat = r.error ? 'err' : category(r);
  return td(`<div class="wf c-${cat}">${wfMarkers}<span class="wf-bar ${r.durationMs == null && !r.error ? 'pending' : ''}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></span></div>`,
    { title: `+${tf(r.relMs)}${r.durationMs != null ? `, took ${r.durationMs} ms` : ', in flight'}` });
};

// Left to right as the request tools read (Charles, Proxyman, Chrome DevTools): what the request is, how it ended, who made it, then when.
const TIMELINE_COLS = [
  { id: 'id', label: 'ID', w: 0.03, fit: { min: '000', max: '000000' }, sort: (r) => r.id, cell: (r) => td(r.id, { cls: 'dim num' }) },
  { id: 'method', label: 'Method', w: 0.045, mono: true, fit: { min: 'GET', max: 'OPTIONS' }, sort: (r) => r.method, cell: (r) => td(esc(r.method), { cls: 'mono verb' }) },
  { id: 'status', label: 'Status', w: 0.05, fit: { min: '', minPx: 74 }, sort: (r) => (r.error ? -1 : r.status), cell: (r) => td(stPill(stClass(r), r.error ? 'err' : r.status ?? '…', stBucket(r.error ? 'error' : r.status), r.error || ''), {}) },
  { id: 'host', label: 'Host', w: 0.11, sort: (r) => r.host, cell: (r) => td(esc(r.host), { cls: 'host', title: r.host }) },
  { id: 'path', label: 'Path', w: 0.15, sort: (r) => r.path, cell: (r) => td(`<span class="path">${esc(r.path)}</span>${r.query ? '<span class="dim">?…</span>' : ''}`, { cls: 'mono', title: r.path + (r.query ? '?' + r.query : '') }) },
  { id: 'site', label: 'Call Site', w: 0.17, sort: (r) => (r.callSiteInfo ? `${r.callSiteInfo.method} ${r.callSiteInfo.file}` : ''), cell: (r) => td(siteCell(r.callSiteInfo, r.callerInfo), { title: siteTitle(r.callSiteInfo, r.callerInfo) }) },
  { id: 'from', label: 'Launched From', w: 0.14, sort: (r) => (r.view ? (r.view.ready ? r.view.route : ' App start-up') : '~'), cell: (r) => td(viewCell(r.view), { title: viewTitle(r.view) }) },
  { id: 'owners', label: 'Code Owners', w: 0.14, sort: (r) => (r.codeOwners || []).map(team).join(', ') || r.callSiteInfo?.pkg || '', cell: (r) => td(rowChips(r), { title: [...(r.codeOwners || []), ...(r.ownerCodeOwners || []).map((o) => o + ' (via)')].join(', ') || r.callSiteInfo?.pkg || '' }) },
  { id: 't', label: 'Time', w: 0.045, fit: TIME_FIT, sort: (r) => r.relMs, cell: (r) => td(tf(r.relMs), { cls: 'alt num' }) },
  { id: 'ms', label: 'Duration', w: 0.04, fit: { min: '000 ms', max: '000.0 s' }, sort: (r) => r.durationMs, sortFirst: 'desc', cell: (r) => td(fmtMs(r.durationMs), { cls: 'alt num' }) },
  { id: 'wf', label: 'Waterfall', w: 0.11, cell: waterfallCell },
];
