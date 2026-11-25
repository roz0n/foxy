// Values a request has for each Filters facet (a request can have several: one per owning team)
const NO_TEAM = '__no_team__';
const VIEW_BOOT = '__before_navigation__', VIEW_UNKNOWN = '__unknown_view__'; // no screen yet (app start) / the app build did not report one
const STATUS_LABEL = { '2xx': '2xx Success', '3xx': '3xx Redirect', '4xx': '4xx Client error', '5xx': '5xx Server error', error: 'Failed (no response)', pending: 'Pending' };
const STATUS_ORDER = Object.keys(STATUS_LABEL);
const FACETS = [
  { id: 'team', label: 'Code owner', sub: 'CODEOWNERS teams', search: 'Search teams' },
  { id: 'view', label: 'Screen', search: 'Search screens', mono: true },
  { id: 'status', label: 'Status' },
  { id: 'method', label: 'Method' },
  { id: 'host', label: 'Host', search: 'Search hosts', mono: true },
];
const FACET_VALUES = {
  team: (r) => {
    const s = adv.team.scope, own = s === 'site' ? r.codeOwners : s === 'via' ? r.ownerCodeOwners : [...(r.codeOwners || []), ...(r.ownerCodeOwners || [])];
    const v = [...new Set((own || []).map(team))];
    return v.length ? v : [NO_TEAM];
  },
  view: (r) => [r.view ? r.view.route || VIEW_BOOT : VIEW_UNKNOWN],
  status: (r) => [r.error ? 'error' : r.status ? `${String(r.status)[0]}xx` : 'pending'],
  method: (r) => [r.method || '?'],
  host: (r) => [r.host || '?'],
};
const advMatch = (r) => {
  for (const f of FACETS) {
    const s = adv[f.id]; if (!s.on.size) continue;
    if (FACET_VALUES[f.id](r).some((v) => s.on.has(v)) === s.not) return false; // picked-and-hit fails an "is not"; missed fails an "is"
  }
  return !adv.minMs || r.durationMs >= adv.minMs;
};
const advActive = () => FACETS.filter((f) => adv[f.id].on.size).length + (adv.minMs ? 1 : 0);
const match = (r) => (!filter || haystack(r).includes(filter))
  && (ui.cat === 'all' || category(r) === ui.cat)
  && (!ui.errors || isFailed(r))
  && (!ui.dupes || dupeCounts.get(reqKey(r)) > 1)
  && (!ui.hl || highlights.has(r.key))
  && (!ui.phase || phaseByKey.get(r.key)?.id === ui.phase)
  && ownerMatch(r)
  && advMatch(r);
