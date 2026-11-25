// ============================================================================
// shared state: the capture, what is open, the filters and the sort order
// ============================================================================
const reqs = new Map(); let markers = []; let tab = 'timeline'; let filter = ''; let open = null;
const ui = { cat: 'all', errors: false, dupes: false, hl: false, owner: null, phase: null, audit: false }; // audit only applies while a phase is focused
// Rows you highlighted, by request key. Kept across reloads of the dashboard; Clear empties them along with the capture.
const HL_KEY = 'foxy.highlights.v1';
const highlights = new Set((() => { try { return JSON.parse(localStorage.getItem(HL_KEY)) || []; } catch { return []; } })());
const saveHighlights = () => localStorage.setItem(HL_KEY, JSON.stringify([...highlights]));
// Column sorting, per tab. null is the tab's natural order: the Timeline is newest first (grouped into phases, and still grouped when sorted), Endpoints is first call first.
// A sort is { id: column, dir: 1 (ascending) | -1 (descending) }.
const sorts = { timeline: null, endpoints: null };
const NATURAL_SORT = { timeline: { id: 't', dir: -1 }, endpoints: { id: 'first', dir: 1 } };
const sortOf = (which) => sorts[which] ?? { ...NATURAL_SORT[which], implicit: true };
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
/** Sorts rows by a column's `sort` key. Rows with no value sit last in either direction; ties fall back to `tie`. */
function sortRows(rows, sort, def, tie) {
  const none = (k) => k == null || k === '' || (typeof k === 'number' && Number.isNaN(k));
  const keyed = rows.map((row) => ({ row, k: def.sort(row) }));
  keyed.sort((a, b) => {
    const an = none(a.k), bn = none(b.k);
    if (an || bn) return an && bn ? tie(a.row, b.row) : an ? 1 : -1;
    const c = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : collator.compare(String(a.k), String(b.k));
    return c ? c * sort.dir : tie(a.row, b.row);
  });
  return keyed.map((x) => x.row);
}
/** Click a header: a new column sorts in its first direction, then the opposite, then back to the natural order. */
function cycleSort(which, colId) {
  const def = grids[which].byId[colId]; if (!def || !def.sort) return;
  const natural = NATURAL_SORT[which], cur = sorts[which] ?? natural, first = def.sortFirst === 'desc' ? -1 : 1;
  let next;
  if (cur.id !== colId) next = colId === natural.id ? { ...natural } : { id: colId, dir: first }; // the natural column's first click is "back to the default view"
  else if (colId === natural.id) next = { id: colId, dir: -cur.dir }; // then it just flips
  else next = cur.dir === first ? { id: colId, dir: -first } : null;
  setSort(which, next && next.id === natural.id && next.dir === natural.dir ? null : next);
}
function setSort(which, sort) {
  sorts[which] = sort;
  grids[which].markSort();
  $('main').scrollTop = 0; // a new order starts from its top
  render();
}
// Filters panel: each facet keeps a set of picked values (any of them matches), and "is not" flips it into an exclusion. Facets combine with AND.
const adv = {
  team: { on: new Set(), not: false, scope: 'any' }, // scope: any | site (call site) | via (started from)
  view: { on: new Set(), not: false },
  status: { on: new Set(), not: false }, method: { on: new Set(), not: false }, host: { on: new Set(), not: false },
  minMs: 0,
};
const fq = { team: '', view: '', host: '' }; // search text inside the long lists
let myTeams = new Set(); try { myTeams = new Set(JSON.parse(localStorage.getItem('foxy.myteams.v1')) || []); } catch {}
let dupeCounts = new Map(); let span = 1; let wfMarkers = ''; let axis = null; // axis: see buildAxis()
let openEp = null; let pendingEp = false;
if (location.hash === '#endpoints') tab = 'endpoints';
const detailCache = new Map();
const $ = (s) => document.querySelector(s);
const icon = (name) => `<svg class="ic"><use href="#i-${name}"/></svg>`;
