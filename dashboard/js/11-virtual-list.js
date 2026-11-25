// ============================================================================
// virtual list: with thousands of requests only the rows near the viewport exist in the DOM.
// Two spacer rows stand in for everything above and below, so the scrollbar still covers the whole list.
// ============================================================================
/**
 * Windowed <tbody>. An item is one logical row (it can render several <tr>s, like a request plus its open detail).
 *   item = { id, hk, kind, est, tall?, html: () => '<tr>…' }
 * Row heights vary (chips wrap, details open), so each item's real height is measured the first time it is on screen
 * and remembered under `hk`; until then the average of its kind stands in. Whenever a measurement changes where things sit
 * above the viewport, the scroll position is corrected so what you are looking at does not jump.
 */
function createVirtualBody(table) {
  const tbody = table.querySelector('tbody'), thead = table.querySelector('thead'), scroller = $('main');
  const OVERSCAN = 700; // px rendered beyond each edge of the viewport
  const topSp = document.createElement('tr'), botSp = document.createElement('tr');
  for (const sp of [topSp, botSp]) { sp.className = 'vs'; sp.setAttribute('aria-hidden', 'true'); sp.innerHTML = '<td colspan="99"></td>'; }
  let items = [], idx = new Map(), offs = new Float64Array(1), s = 0, e = 0, built = false, ticking = false;
  const cache = new Map(), stat = new Map(); // measured heights by hk; per-kind averages (open rows excluded) for the unmeasured
  const n = () => items.length;
  const est = (it) => { const k = stat.get(it.kind); return k ? k.sum / k.n : it.est; };
  function layout() {
    offs = new Float64Array(items.length + 1);
    let y = 0;
    for (let i = 0; i < items.length; i++) { offs[i] = y; y += cache.get(items[i].hk) ?? est(items[i]); }
    offs[items.length] = y;
  }
  /** Viewport in tbody coordinates, plus what the sticky header covers. */
  function geom() {
    const top = tbody.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop, hh = thead.offsetHeight;
    return { top, hh, v0: scroller.scrollTop + hh - top, v1: scroller.scrollTop + scroller.clientHeight - top };
  }
  const firstBelow = (y) => { let lo = 0, hi = n(); while (lo < hi) { const m = (lo + hi) >> 1; if (offs[m + 1] > y) hi = m; else lo = m + 1; } return lo; }; // first item whose bottom is past y
  const firstAtOrAfter = (y) => { let lo = 0, hi = n(); while (lo < hi) { const m = (lo + hi) >> 1; if (offs[m] >= y) hi = m; else lo = m + 1; } return lo; };
  const markup = (i) => items[i].html().replace(/<tr(?=[\s>])/g, `<tr data-vi="${i}"`);
  const markupRange = (a, b) => { let h = ''; for (let i = a; i < b; i++) h += markup(i); return h; };
  const spacers = () => { topSp.firstChild.style.height = offs[s] + 'px'; botSp.firstChild.style.height = offs[n()] - offs[e] + 'px'; };
  function paint(a, b) {
    tbody.textContent = ''; tbody.append(topSp, botSp);
    botSp.insertAdjacentHTML('beforebegin', markupRange(a, b));
  }
  function slide(a, b) {
    if (a >= e || b <= s) { paint(a, b); return; } // jumped somewhere with nothing in common
    while (topSp.nextElementSibling !== botSp && +topSp.nextElementSibling.dataset.vi < a) topSp.nextElementSibling.remove();
    while (botSp.previousElementSibling !== topSp && +botSp.previousElementSibling.dataset.vi >= b) botSp.previousElementSibling.remove();
    if (a < s) topSp.insertAdjacentHTML('afterend', markupRange(a, s));
    if (b > e) botSp.insertAdjacentHTML('beforebegin', markupRange(e, b));
  }
  /** Reads the real height of every rendered item. True when any of them differs from what the layout assumed. */
  function measure() {
    const sums = new Map();
    for (let el = topSp.nextElementSibling; el && el !== botSp; el = el.nextElementSibling) {
      const i = +el.dataset.vi; sums.set(i, (sums.get(i) || 0) + el.getBoundingClientRect().height);
    }
    let changed = false;
    for (const [i, h] of sums) {
      const it = items[i]; if (!it) continue;
      const old = cache.get(it.hk);
      if (old !== undefined && Math.abs(old - h) < 0.4) continue;
      changed = true; cache.set(it.hk, h);
      if (!it.tall) { const k = stat.get(it.kind) || { sum: 0, n: 0 }; if (old === undefined) { k.n++; k.sum += h; } else k.sum += h - old; stat.set(it.kind, k); }
    }
    return changed;
  }
  /** Brings the DOM in line with the scroll position. `full` rebuilds the window instead of sliding it. */
  function sync(full) {
    if (!table.offsetParent) return; // the other tab is showing
    layout();
    const g = geom(), ai = Math.min(firstBelow(g.v0), Math.max(0, n() - 1)), aOff = offs[ai] - g.v0;
    const a = Math.min(n(), firstBelow(g.v0 - OVERSCAN)), b = Math.min(n(), firstAtOrAfter(g.v1 + OVERSCAN) + 1);
    if (full || !built) paint(a, b); else slide(a, b);
    s = a; e = Math.max(a, b); built = true; spacers();
    if (measure()) {
      layout(); spacers();
      const delta = offs[ai] - aOff - g.v0; // the item at the top of the view must stay put
      if (n() && Math.abs(delta) > 0.5) scroller.scrollTop += delta;
    }
  }
  const requestSync = () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { ticking = false; sync(false); }); };
  scroller.addEventListener('scroll', requestSync, { passive: true });
  tbody.addEventListener('toggle', requestSync, true); // opening a <details> changes the row's height

  return {
    /** Replaces the list. When the view is scrolled, the item at the top of it stays where it is even if rows were added above it. */
    setItems(next, cols) {
      let prev = null;
      if (built && n() && scroller.scrollTop > 2 && table.offsetParent) {
        layout(); const g = geom(), i = Math.min(firstBelow(g.v0), n() - 1);
        prev = { id: items[i].id, off: offs[i] - g.v0 };
      }
      items = next; idx = new Map(next.map((it, i) => [it.id, i]));
      topSp.firstChild.colSpan = botSp.firstChild.colSpan = cols;
      sync(true);
      if (prev && idx.has(prev.id)) {
        const delta = offs[idx.get(prev.id)] - prev.off - geom().v0;
        if (Math.abs(delta) > 0.5) scroller.scrollTop += delta;
      }
    },
    /** Scrolls an item into view (rendering it first) and returns its first <tr>, or null when it is not in the list. */
    reveal(id, block) {
      const i = idx.get(id); if (i == null || !table.offsetParent) return null;
      const place = () => {
        layout(); const g = geom(), first = tbody.querySelector(`tr[data-vi="${i}"]`);
        const h = first ? first.getBoundingClientRect().height : offs[i + 1] - offs[i]; // centre the row itself, not its open detail
        const v0 = block === 'start' ? offs[i] : offs[i] - Math.max(0, (g.v1 - g.v0 - h) / 2);
        scroller.scrollTop = v0 - g.hh + g.top;
      };
      place(); sync(false); place(); sync(false); place(); // estimated heights above the target settle as they are measured
      return tbody.querySelector(`tr[data-vi="${i}"]`);
    },
    /** Row heights depend on the column widths, so a resize makes every remembered height stale. */
    invalidate() { cache.clear(); stat.clear(); },
  };
}
const timelineV = createVirtualBody($('#timeline')), endpointsV = createVirtualBody($('#endpoints'));
