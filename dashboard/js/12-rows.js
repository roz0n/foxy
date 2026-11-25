// ============================================================================
// rendering
// ============================================================================
/** The spans with no marker of their own (before the first one, and after an ended phase). They are what the live capture produced, not something you named, so they are a quiet divider with their requests under it, not an accordion. */
function unmarkedDivider(p, cols) {
  const end = p.end === Infinity ? span : p.end;
  const range = `+${tf(p.start)} → ${p.end === Infinity ? 'now' : '+' + tf(p.end)} · ${dur(end - p.start)}`;
  return `<tr class="unmarked" data-pid="${esc(p.id)}"><td colspan="${cols}"><div class="um">
    <span class="um-line"></span><span class="um-label">${esc(p.label)}</span><span class="um-range">${range}${p.end === Infinity ? ' · still capturing' : ''}</span><span class="um-count">${p.n} request${p.n === 1 ? '' : 's'}</span>
    <button class="icon-btn sm" data-act="export" aria-label="${esc(exportTip(p))}" title="${esc(exportTip(p))}">${icon('tb-download')}</button><span class="um-line"></span></div></td></tr>`;
}
/** One header row per phase: name, time range, ownership mix, and what happened in it. */
function phaseHeader(p, cols) {
  if (!p.marker) return unmarkedDivider(p, cols);
  const isOpen = !collapsed.has(p.id), only = ui.phase === p.id;
  const end = p.end === Infinity ? span : p.end;
  const tot = p.n || 1, w = (k) => ((p[k] / tot) * 100).toFixed(1);
  const mix = p.n ? `<span class="ph-mix" title="${p.ours} owned · ${p.third} third-party · ${p.unowned} unowned"><i class="ours" style="width:${w('ours')}%"></i><i class="third" style="width:${w('third')}%"></i><i class="unowned" style="width:${w('unowned')}%"></i></span>` : '';
  const pill = (cls, text, tip) => `<span class="ph-pill ${cls}" title="${esc(tip)}">${text}</span>`;
  const pills = !p.n ? pill('quiet', '🌙 quiet · no requests', 'Nothing was requested during this phase')
    : [pill('', `${p.n} request${p.n > 1 ? 's' : ''}`, 'Requests made during this phase'),
      p.newEps ? pill('new', `${p.newEps} new endpoint${p.newEps > 1 ? 's' : ''}`, 'Endpoints first seen in this phase') : '',
      p.dupes ? pill('dup', `${p.dupes} identical dupe${p.dupes > 1 ? 's' : ''}`, 'Repeats of a request already made earlier in the capture') : '',
      p.failed ? pill('bad', `${p.failed} failed`, 'Errors, aborts and 4xx/5xx responses') : ''].join('');
  const range = `+${tf(p.start)} → ${p.end === Infinity ? 'now' : '+' + tf(p.end)} · ${dur(end - p.start)}`;
  return `<tr class="phase" data-pid="${esc(p.id)}" style="--pc:${p.color}"><td colspan="${cols}"><div class="ph">
    <button class="ph-tgl" data-act="toggle" aria-expanded="${isOpen}" aria-label="${isOpen ? 'Collapse' : 'Expand'} phase ${esc(p.label)}">${icon('chevron')}</button>
    <span class="ph-label">${p.marker ? icon('flag') : ''}${esc(p.label)}</span><span class="ph-time">${range}</span>${mix}<span class="ph-pills">${pills}</span>
    <span class="ph-actions">${endControl(p, '')}<button data-act="focus" aria-pressed="${only}" aria-label="${only ? 'Show every phase again' : 'Focus on this phase'}" title="${only ? 'Show every phase again' : 'Focus on this phase (also filters Endpoints)'}">${icon('tb-focus')}</button><button data-act="export" aria-label="${esc(exportTip(p))}" title="${esc(exportTip(p))}">${icon('tb-download')}</button>${p.marker ? `<button class="icon-btn sm" data-act="edit" title="Rename or delete this marker" aria-label="Edit marker">${icon('tb-edit')}</button>` : ''}</span></div></td></tr>`;
}

/** Marks where the requests that arrived during a pause start. The list is newest first, so they sit above this line. */
function heldDivider(id, cols) {
  const p = pauses.get(id); let n = 0;
  for (const g of heldKeys.values()) if (g === id) n++;
  const clock = new Date(p.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return `<tr class="held-divider"><td colspan="${cols}"><div class="hd"><span class="hd-line"></span><span class="hd-label">${icon('pause')}Paused at ${clock} for ${dur(p.endedAt - p.at)}</span><span class="hd-pill">${icon('chevron')}${n} request${n === 1 ? '' : 's'} arrived while paused</span><span class="hd-line"></span></div></td></tr>`;
}

function renderTimeline() {
  const order = timelineGrid.order(), cols = timelineGrid.colspan();
  const every = [...reqs.values()];
  timelineGrid.fit({ // number columns grow with the widest value in the whole capture, not just what the filters show
    id: String(every.reduce((m, r) => Math.max(m, r.id || 0), 0)), t: tf(every.reduce((m, r) => Math.max(m, r.relMs), 0)),
    method: every.reduce((m, r) => (r.method.length > m.length ? r.method : m), 'GET'), status: '', ms: fmtMs(every.reduce((m, r) => Math.max(m, r.durationMs || 0), 0)),
  });
  const matched = [...reqs.values()].filter(match);
  // The Timeline always keeps its phases. ID and Time sort by time, so their direction picks which end comes first; any other column
  // orders the requests inside each phase (phases stay newest first).
  const sort = sorts.timeline, byColumn = Boolean(sort) && sort.id !== 'id' && sort.id !== 't', oldestFirst = Boolean(sort) && !byColumn && sort.dir === 1;
  // each pause's divider goes right next to its oldest visible request (a list sorted by another column has no pauses to show)
  const oldestHeld = new Map();
  if (!byColumn) for (const r of matched) {
    const g = heldKeys.get(r.key); if (g == null || !pauses.has(g)) continue;
    const cur = oldestHeld.get(g); if (!cur || r.relMs < cur.relMs) oldestHeld.set(g, r);
  }
  const dividerAt = new Map([...oldestHeld].map(([g, r]) => [r.key, g]));
  // newest first puts the requests that arrived during a pause above the divider; oldest first puts them below it
  const rowHtml = (r) => {
    const divider = dividerAt.has(r.key) ? heldDivider(dividerAt.get(r.key), cols) : '';
    return `${oldestFirst ? divider : ''}<tr class="req${open === r.key ? ' open' : ''}${highlights.has(r.key) ? ' hl' : ''}" data-k="${esc(r.key)}">${order.map((c) => timelineGrid.byId[c].cell(r)).join('')}</tr>${open === r.key ? renderDetailRow(r, cols) : ''}${oldestFirst ? '' : divider}`;
  };
  // keep <details> open/closed state while re-rendering the detail row
  const openState = [...document.querySelectorAll('tr.detail details')].map((d) => d.open);
  // The list is a flat array of items (phase headers and requests); the virtual body only turns the ones near the viewport into HTML.
  const reqItem = (r) => ({ id: r.key, kind: 'req', est: 36, tall: open === r.key, hk: `${r.key}${open === r.key ? '#open' : ''}${dividerAt.has(r.key) ? '#div' : ''}`, html: () => rowHtml(r) });
  const noteItem = (id, text, cls) => ({ id, kind: 'note', est: 44, hk: id, html: () => `<tr${cls ? ` class="${cls}"` : ''}><td colspan="${cols}" class="empty">${text}</td></tr>` });
  const rows = byColumn ? sortRows(matched, sort, timelineGrid.byId[sort.id], (a, b) => b.relMs - a.relMs) : matched.sort((a, b) => (oldestFirst ? a.relMs - b.relMs : b.relMs - a.relMs));
  const items = [];
  if (phases.length) {
    const byPhase = new Map();
    for (const r of rows) { const p = phaseByKey.get(r.key); if (!byPhase.has(p)) byPhase.set(p, []); byPhase.get(p).push(r); }
    for (const p of oldestFirst ? phases : [...phases].reverse()) { // newest phase first by default, requests in the same direction inside it
      if (ui.phase && ui.phase !== p.id) continue;
      items.push({ id: `phase:${p.id}`, kind: 'phase', est: 46, hk: `phase:${p.id}`, html: () => phaseHeader(p, cols) });
      if (collapsed.has(p.id)) continue;
      const inPhase = byPhase.get(p) || [];
      if (inPhase.length) for (const r of inPhase) items.push(reqItem(r));
      else items.push(noteItem(`empty:${p.id}`, p.n ? 'No requests in this phase match the filters.' : p.marker ? 'Nothing was requested in this phase.' : 'Nothing was requested here.', 'phase-empty'));
    }
  } else if (rows.length) {
    for (const r of rows) items.push(reqItem(r));
  } else {
    items.push(noteItem('empty', reqs.size ? 'No requests match these filters.' : 'Waiting for requests… launch the app with FOXY="true".'));
  }
  timelineV.setItems(items, cols);
  const now = document.querySelectorAll('tr.detail details');
  if (now.length === openState.length) now.forEach((d, i) => { d.open = openState[i]; });
}

const card = (label, value, sub, tone) => `<div class="card ${tone || ''}"><div class="cl">${label}</div><div class="cv">${value}</div><div class="cs">${sub || '&nbsp;'}</div></div>`;

function paramsPanel(g) {
  const params = new Map();
  for (const r of g.list) for (const [k, v] of new URLSearchParams(r.query || '')) { const m = params.get(k) || new Map(); m.set(v, (m.get(v) || 0) + 1); params.set(k, m); }
  if (!params.size) return '<div class="hint">No query parameters.</div>';
  const short = (v) => (v.length > 34 ? v.slice(0, 33) + '…' : v);
  const rows = [...params.entries()].sort((a, b) => b[1].size - a[1].size);
  const varying = rows.filter(([, m]) => m.size > 1), constant = rows.filter(([, m]) => m.size === 1);
  const vrow = ([k, m]) => `<div class="r"><div class="k">${esc(k)}<br><span class="dim">${m.size} values</span></div><div class="v"><div class="pchips">${[...m.entries()].slice(0, 4).map(([v, n]) => `<span class="pchip" title="${esc(v)}">${esc(short(v))}${n > 1 ? ` ×${n}` : ''}</span>`).join('')}${m.size > 4 ? `<span class="dim">+${m.size - 4} more</span>` : ''}</div></div></div>`;
  const crow = ([k, m]) => { const v = [...m.keys()][0]; return `<div class="r"><div class="k">${esc(k)}</div><div class="v alt" title="${esc(v)}">${esc(short(v))}</div></div>`; };
  return `${varying.length ? `<div class="kv">${varying.map(vrow).join('')}</div>` : '<div class="hint">Nothing changes between calls: every call asks for the same thing.</div>'}${constant.length ? `<div class="sub-h">Same in Every Call</div><div class="kv">${constant.slice(0, 8).map(crow).join('')}</div>${constant.length > 8 ? `<div class="hint">+${constant.length - 8} more</div>` : ''}` : ''}`;
}

function renderEndpointDetail(g, cols) {
  const aph = auditPhase(), v = aph ? auditOf(aph, g.k) : {};
  const cards = [
    card('Calls', g.n, `${g.byQuery.size} unique request${g.byQuery.size > 1 ? 's' : ''}`),
    card('Identical Dupes', g.dupes ? `+${g.dupes}` : '0', g.dupes ? `${g.wastedMs} ms · ${bytes(g.wastedBytes) || '0 B'} redundant` : 'no repeats', g.dupes ? 'warn' : 'good'),
    card('Latency', g.avg != null ? `${g.avg} ms` : '—', g.avg != null ? `p95 ${g.p95} · max ${g.max}` : 'no responses'),
    card('Burst', `${g.burst}×`, 'most calls within 1 second', g.burst > 2 ? 'warn' : ''),
    card('First → Last', `+${tf(g.first)}`, g.n > 1 ? `last +${tf(g.last)} · span ${dur(g.last - g.first)}` : 'single call'),
    card('Payload', bytes(g.bytesTotal) || '0 B', g.failed ? `${g.failed} failed` : 'none failed', g.failed ? 'bad' : ''),
  ].join('');
  const gapHtml = (idx) => {
    if (!idx) return '<span class="gap long">first</span>';
    const d = g.list[idx].relMs - g.list[idx - 1].relMs;
    return d < 50 ? '<span class="gap burst" title="Fired at essentially the same moment as the previous call">⚡ same time</span>' : `<span class="gap ${d > 5000 ? 'long' : ''}">+${dur(d)}</span>`;
  };
  const rows = g.list.map((r, idx) => {
    const group = g.byQuery.get(dupeKey(r)), dup = g.dupeIds.has(r.key), firstOf = group[0];
    const badge = dup ? `<span class="badge dup" title="Identical request (same method, URL, query and body) to #${firstOf.id}">↻ same as #${firstOf.id}</span>` : group.length > 1 ? '<span class="badge first" title="Later calls repeat this exact request">first of repeats</span>' : '';
    return `<div class="call ${dup ? 'dup' : ''}" data-open="${esc(r.key)}" tabindex="0" role="button" title="Open in Timeline">
      <span class="rail"><i class="rdot ${tickCls(r)}"></i></span>
      <span class="c-id">#${r.id}</span>
      <span class="c-time"><b>+${tf(r.relMs)}</b><small>${clock(r.ts)}</small></span>
      <span>${gapHtml(idx)}</span>
      <span>${stPill(`mini ${stClass(r)}`, r.error ? 'err' : r.status ?? '…', stBucket(r.error ? 'error' : r.status))}</span>
      <span class="c-ms">${r.durationMs != null ? r.durationMs + ' ms' : ''}</span>
      <span class="c-size">${bytes(r.sizeBytes)}</span>
      <span class="c-site">${fnCell(r.callSiteInfo, true)}</span>
      <span class="c-own"><div class="chips">${ownerChips(r.callSiteInfo, r.codeOwners, r.ownerCodeOwners, 2) || noneChip('—')}</div></span>
      <span>${badge}</span></div>`;
  }).reverse().join(''); // newest first, like the Timeline
  const callers = [...g.sites.values()].sort((a, b) => b.n - a.n).map((e) => `<div class="caller">${fnCell(e.info, false, { copy: true })}<span class="badge">×${e.n}</span><div class="chips">${ownerChips(e.info, e.owners, e.via, 2)}</div></div>`).join('') || '<div class="hint">No stack captured.</div>';
  return `<tr class="detail${enterKey === g.k ? ' enter' : ''}" data-k="${esc(g.k)}"><td colspan="${cols}">
    <div class="cards">${cards}</div>
    <div class="egrid">
      <section class="panel"><h3>Every Call<span class="n" style="margin-left:8px">${g.n}</span>${cp(g.list.map((r) => `#${r.id}\t+${sec(r.relMs)}s\t${clock(r.ts)}\t${r.error ? 'error' : r.status ?? ''}\t${r.durationMs ?? ''}ms\t${r.url}`).join('\n'), 'Copy call list', { right: true, label: 'Copy Calls' })}</h3>
        ${lane(g, true)}<div class="axis flush">${axisLabels()}</div>
        <div class="calls"><div class="calls-in">
          <div class="call head"><span></span><span>#</span><span>When</span><span>After prev</span><span>Status</span><span>Time</span><span>Size</span><span>Call site</span><span>Owner</span><span></span></div>
          ${rows}</div></div>
      </section>
      <div class="estack">
        ${aph ? `<section class="panel vpanel"><h3>Verdict<span class="n" style="margin-left:8px">${esc(aph.label)}</span><button type="button" class="icon-btn sm vhelp" aria-haspopup="true" aria-expanded="false" aria-controls="vLegend" aria-label="What do the verdicts mean?" title="What do the verdicts mean?"><svg class="ic"><use href="#i-help"/></svg></button></h3>
          <div class="seg vseg" role="group" aria-label="Verdict">${VERDICTS.map((x) => `<button data-verdict="${x.id}" class="${v.v === x.id ? 'active' : ''}" aria-pressed="${v.v === x.id}" style="--c:${x.c}" title="${esc(x.tip)}"><i class="dot" style="background:${x.c}"></i>${x.label}</button>`).join('')}</div>
          <textarea class="note" data-note="${esc(g.k)}" rows="3" aria-label="Reason for the verdict" placeholder="Why? For example: only needed once the user opens Swap, so fetch it then.">${esc(v.note || '')}</textarea>
          <div class="hint">Saved in this browser for this phase only, and included in the phase export (markdown, CSV, agent JSON).</div></section>` : ''}
        <section class="panel"><h3>What Changes Between Calls</h3>${paramsPanel(g)}</section>
        <section class="panel"><h3>Who Calls It</h3>${callers}</section>
      </div>
    </div></td></tr>`;
}

function renderEndpoints() {
  const order = endpointsGrid.order(), cols = endpointsGrid.colspan(), aph = auditPhase();
  const natural = (a, b) => a.first - b.first;
  let groups = buildGroups([...reqs.values()].filter(match)).sort(natural);
  if (sorts.endpoints) groups = sortRows(groups, sorts.endpoints, endpointsGrid.byId[sorts.endpoints.id], natural);
  endpointsGrid.fit({ first: tf(groups.reduce((m, g) => Math.max(m, g.first), 0)), calls: String(groups.reduce((m, g) => Math.max(m, g.n), 0)), avg: fmtMs(groups.reduce((m, g) => Math.max(m, g.avg || 0), 0)) });
  endpointsV.setItems(groups.length
    ? groups.map((g) => ({ id: g.k, kind: 'ep', est: 36, tall: openEp === g.k, hk: `${g.k}${openEp === g.k ? '#open' : ''}${aph ? '#' + (auditOf(aph, g.k).v || '-') : ''}`,
      html: () => `<tr class="ep${openEp === g.k ? ' open' : ''}${g.list.some((r) => highlights.has(r.key)) ? ' hl' : ''}" data-k="${esc(g.k)}">${order.map((c) => endpointsGrid.byId[c].cell(g)).join('')}</tr>${openEp === g.k ? renderEndpointDetail(g, cols) : ''}` }))
    : [{ id: 'empty', kind: 'note', est: 44, hk: 'empty', html: () => `<tr><td colspan="${cols}" class="empty">${reqs.size ? 'No endpoints match these filters.' : 'Waiting for requests…'}</td></tr>` }], cols);
}

/** Every endpoint one phase called (not just what the filters show), in first-call order: the audit covers the whole phase. */
const auditGroups = (ph) => buildGroups([...reqs.values()].filter((r) => phaseByKey.get(r.key)?.id === ph.id)).sort((a, b) => a.first - b.first);
const mdCell = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const siteText = (info) => (info ? `${info.method}() ${info.file}:${info.line}` : '');
const slugOf = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'phase';
function downloadText(text, name, type) {
  const href = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}
const verdictCounts = (ph, groups) => {
  const n = { keep: 0, defer: 0, move: 0, drop: 0, none: 0 };
  for (const g of groups) n[auditOf(ph, g.k).v || 'none']++;
  return n;
};
/** The audit as a markdown table: one row per endpoint the phase called, judged or not. */
function auditMarkdown(ph) {
  const groups = auditGroups(ph), n = verdictCounts(ph, groups);
  const when = `+${sec(ph.start)}s to ${ph.end === Infinity ? 'now (still collecting)' : `+${sec(ph.end)}s`}`;
  const rows = groups.map((g) => {
    const v = auditOf(ph, g.k), site = [...g.sites.values()][0]?.info;
    return `| ${mdCell(g.k)} | ${mdCell(VERDICTS.find((x) => x.id === v.v)?.label || 'No verdict')} | ${mdCell(v.note || '')} | ${g.n} | ${g.dupes} | ${mdCell(Object.entries(g.st).map(([s2, c]) => `${s2}×${c}`).join(' '))} | ${g.avg ?? ''} | ${mdCell(g.ownerText)} | ${mdCell(siteText(site))} | ${sec(g.first)} |`;
  });
  return `## Audit: ${ph.label}\n\nPhase window ${when}. ${ph.n} request${ph.n === 1 ? '' : 's'} to ${groups.length} endpoint${groups.length === 1 ? '' : 's'}.\n\nKeep ${n.keep} · Defer ${n.defer} · Move ${n.move} · Drop ${n.drop} · No verdict ${n.none}\n\n| Endpoint | Verdict | Reason | Calls | Identical dupes | Statuses | Avg ms | Code owner | Call site | First call (+s) |\n|---|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
}
/** Client-side markdown for the Endpoints tab, including verdicts and notes. */
function endpointsMarkdown(list = [...reqs.values()].filter(match)) {
  const c = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  const groups = buildGroups(list).sort((a, b) => a.first - b.first);
  const head = '| First +s | Phase | Endpoint | Code owner | Calls | Identical dupes | Statuses | Avg ms | Call site | Verdict | Notes |\n|---|---|---|---|---|---|---|---|---|---|---|';
  const phaseTable = phases.length
    ? `Phases (each marker starts a phase that lasts until the next one):\n\n| Phase | Starts (+s) | Requests | New endpoints | Identical dupes | Failed |\n|---|---|---|---|---|---|\n${phases.map((p) => `| ${c(p.label)} | ${sec(p.start)} | ${p.n} | ${p.newEps} | ${p.dupes} | ${p.failed} |`).join('\n')}\n\n`
    : '';
  const rows = groups.map((g) => {
    const site = [...g.sites.values()][0]?.info, v = auditOf(phaseOfGroup(g), g.k);
    return `| ${sec(g.first)} | ${c(phaseByKey.get(g.list[0].key)?.label || '')} | ${c(g.k)} | ${c(g.ownerText)} | ${g.n} | ${g.dupes} | ${c(Object.entries(g.st).map(([s, n]) => `${s}×${n}`).join(' '))} | ${g.avg ?? ''} | ${site ? c(`${site.method}() ${site.file}:${site.line}`) : ''} | ${c(VERDICTS.find((x) => x.id === v.v)?.label || '')} | ${c(v.note || '')} |`;
  });
  return `${phaseTable}${head}\n${rows.join('\n')}\n`;
}
