// ---- CSV: one row per request, or one per endpoint (with its verdict and reason) ----
const fileStamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
/** One CSV cell. Text that starts with = + - @ is prefixed with an apostrophe so a spreadsheet never runs it as a formula (a typed reason can say anything). */
function csvCell(x) {
  if (x == null) return '';
  if (typeof x === 'number') return Number.isFinite(x) ? String(x) : '';
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  let s = String(x);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (head, rows) => `\ufeff${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`; // BOM: Excel reads the UTF-8
const ownersText = (r) => (r.codeOwners || []).map(team).join(' ') || r.callSiteInfo?.pkg || '';
const viaText = (r) => (r.ownerCodeOwners || []).filter((o) => !(r.codeOwners || []).includes(o)).map(team).join(' ');
function requestsCsv(list = [...reqs.values()].filter(match)) {
  const head = ['ID', 'Time (s)', 'Started at', 'Phase', 'Method', 'Host', 'Path', 'Query', 'Status', 'Error', 'Duration (ms)', 'Finished at', 'Size (bytes)', 'Identical dupe', 'Code owners', 'Via caller', 'Screen', 'Call site', 'Started from'];
  return toCsv(head, [...list].sort((a, b) => a.relMs - b.relMs).map((r) => [
    r.id, Number(sec(r.relMs)), isoLocal(r.ts), phaseByKey.get(r.key)?.label || '', r.method, r.host, r.path, r.query || '',
    r.status ?? '', r.error || '', r.durationMs == null ? null : Math.round(r.durationMs), r.durationMs == null ? '' : isoLocal(r.ts + r.durationMs), r.sizeBytes ?? null, dupeCounts.get(reqKey(r)) > 1,
    ownersText(r), viaText(r), r.view ? (r.view.ready ? r.view.route : 'App start-up') : '', siteText(r.callSiteInfo), siteText(r.ownerInfo),
  ]));
}
function endpointsCsv(list = [...reqs.values()].filter(match)) {
  const head = ['Phase', 'Endpoint', 'Method', 'Host', 'Path', 'Calls', 'Identical dupes', 'Failed', 'Statuses', 'Avg (ms)', 'P95 (ms)', 'Bytes', 'First call (s)', 'First call at', 'Last call at', 'Launched from', 'Code owners', 'Call site', 'Verdict', 'Reason'];
  const groups = buildGroups(list).sort((a, b) => a.first - b.first);
  return toCsv(head, groups.map((g) => {
    const v = auditOf(phaseOfGroup(g), g.k), site = [...g.sites.values()][0]?.info;
    return [
      phaseOfGroup(g)?.label || '', g.k, g.method, g.host, g.path, g.n, g.dupes, g.failed, Object.entries(g.st).map(([s, n]) => `${s === '…' ? 'pending' : s}x${n}`).join(' '),
      g.avg, g.p95 == null ? null : Math.round(g.p95), g.bytesTotal, Number(sec(g.first)), isoLocal(g.firstAt), isoLocal(g.lastAt), screensOf(g), g.ownerText, siteText(site),
      VERDICTS.find((x) => x.id === v.v)?.label || '', v.note || '',
    ];
  }));
}

// ---- Export dialog: every download button opens it. Pick a format, then Export. ----
const xdlg = $('#exportDlg');
let xScope = null, xFmt = '', xBusy = false;
const phaseReqs = (ph) => [...reqs.values()].filter((r) => phaseByKey.get(r.key)?.id === ph.id);
/** The formats on offer for a scope. `run` does the work and returns the label to flash. */
function exportFormats(scope) {
  const ph = scope.kind === 'phase' ? phases.find((p) => p.id === scope.id) : null;
  const slug = ph ? slugOf(ph.label) : 'capture', stamp = fileStamp();
  const list = () => (ph ? phaseReqs(ph) : $('#xFilterOn').checked ? [...reqs.values()].filter(match) : [...reqs.values()]);
  const save = (text, name, type) => { downloadText(text, name, type); return 'Saved'; };
  // Every CSV and markdown export opens by saying it is from Foxy, when, and from which checkout and app build (the server knows those).
  const scopeLabel = ph ? `Phase "${ph.label}"` : $('#xFilterOn').checked ? 'Filtered requests' : 'Whole capture';
  const facts = async (format) => {
    const n = list().length;
    try { const r = await fetch('/api/export/header?' + new URLSearchParams({ format, scope: scopeLabel, shown: n, total: ph ? n : reqs.size })); return r.ok ? await r.text() : ''; } catch { return ''; }
  };
  const csvWith = async (csv) => { const h = await facts('csv'); return csv.replace(/^\ufeff/, (bom) => bom + h); };
  const json = {
    id: 'json', title: 'JSON, full detail', tag: '.json', verb: 'Download JSON',
    desc: ph ? `Every request with headers, bodies and the call chain, plus the phase totals${ph.end === Infinity ? ' (still capturing: what has arrived so far)' : ''}.` : 'The whole session: every request in full, the markers and the phases. Ignores filters.',
    run: async () => { await downloadFromServer(ph ? '/api/export/phase?marker=' + encodeURIComponent(ph.id) : '/api/export/capture', 'foxy-export.json'); return 'Saved'; },
  };
  const csvReq = { id: 'csv-req', title: 'CSV, one row per request', tag: '.csv', verb: 'Download CSV', desc: 'Time, phase, method, host, path, status, duration, size, owners and call site. Opens in a spreadsheet.', run: async () => save(await csvWith(requestsCsv(list())), `foxy-${slug}-requests-${stamp}.csv`, 'text/csv;charset=utf-8') };
  const csvEp = { id: 'csv-ep', title: 'CSV, one row per endpoint', tag: '.csv', verb: 'Download CSV', desc: 'Calls, dupes, failures, timings, launched-from screens, owners and call site, with the verdict and reason you gave each one.', run: async () => save(await csvWith(endpointsCsv(list())), `foxy-${slug}-endpoints-${stamp}.csv`, 'text/csv;charset=utf-8') };
  // A phase's markdown comes from the server, built from the same audit document the agent JSON uses (the verdicts are saved first), so the
  // table and the per-endpoint drilldown can never disagree with it.
  const auditMd = async () => {
    await flushAudits().catch(() => {});
    const res = await fetch('/api/audit/export?format=md&phase=' + encodeURIComponent(ph.id));
    if (!res.ok) throw new Error('audit export failed');
    return res.text();
  };
  const mdText = async () => (ph ? auditMd() : (await facts('md')) + endpointsMarkdown(list()));
  const md = { id: 'md', title: 'Markdown table, copy', tag: 'copies', verb: 'Copy Markdown', desc: ph ? 'The audit table, then a drilldown for every endpoint: launched-from screens, callers, what changes between calls and every call. Paste it wherever you are writing this up.' : 'A table to paste wherever you are writing this up.', keepOpen: true, run: async () => { await copyText(await mdText()); return 'Copied!'; } };
  const mdFile = { id: 'md-file', title: 'Markdown file', tag: '.md', verb: 'Download Markdown', desc: ph ? 'The same audit and drilldown, saved as a file you can attach to a PR or a ticket.' : 'The same table, saved as a file you can attach to a PR or a ticket.', run: async () => save(await mdText(), `foxy-${slug}-${ph ? 'audit' : 'endpoints'}-${stamp}.md`, 'text/markdown;charset=utf-8') };
  if (!ph) return [json, csvReq, csvEp, md, mdFile];
  const agent = { id: 'agent', title: 'JSON for an agent', tag: '.json', verb: 'Download JSON', desc: 'Verdicts and reasons, plus each endpoint\'s drilldown (launched-from screens, every call, callers, what changes), with instructions an AI agent can act on. Agents can also read it themselves (audit_get).', run: async () => { await flushAudits().catch(() => {}); await downloadFromServer('/api/audit/export?phase=' + encodeURIComponent(ph.id), `foxy-audit-${slug}.json`); return 'Saved'; } };
  return [json, csvReq, csvEp, md, mdFile, agent];
}
/** Builds the option list. Only openExport calls it: picking an option never rebuilds the list, which is what made the dialog flicker. */
function xRender() {
  const fmts = exportFormats(xScope);
  if (!fmts.some((f) => f.id === xFmt)) xFmt = fmts[0].id;
  $('#xOpts').innerHTML = fmts.map((f) => `<label class="xopt"><input type="radio" name="xfmt" value="${f.id}" ${f.id === xFmt ? 'checked' : ''} /><span class="xt">${esc(f.title)}</span><span class="xtag">${esc(f.tag)}</span><span class="xd">${esc(f.desc)}</span></label>`).join('');
  xSync();
}
/** Points the Export button at the chosen format, in place. */
function xSync() {
  if (xBusy) return;
  const f = exportFormats(xScope).find((x) => x.id === xFmt);
  if (f) $('#xGo').textContent = f.verb;
}
function openExport(scope) {
  const ph = scope.kind === 'phase' ? phases.find((p) => p.id === scope.id) : null;
  if (scope.kind === 'phase' && !ph) { toast('That phase is gone'); return; }
  xScope = scope; xFmt = localStorage.getItem(`foxy.export.fmt.${scope.kind}`) || '';
  $('#xScope').innerHTML = ph
    ? `<i class="ph-dot" style="background:${ph.color}"></i><b>${esc(ph.label)}</b><span>${ph.n} request${ph.n === 1 ? '' : 's'}${ph.end === Infinity ? ', still capturing' : ''}</span>`
    : `<b>Whole capture</b><span>${reqs.size} request${reqs.size === 1 ? '' : 's'}${markers.length ? `, ${markers.length} marker${markers.length === 1 ? '' : 's'}` : ''}</span>`;
  const narrowed = !ph && [...reqs.values()].filter(match).length !== reqs.size;
  $('#xFilter').hidden = !narrowed; $('#xFilterOn').checked = false;
  if (narrowed) $('#xFilter span').textContent = `Only what my filters show (${[...reqs.values()].filter(match).length} of ${reqs.size}). Applies to CSV and Markdown; the full JSON always has everything.`;
  const go = $('#xGo'); go.disabled = false; go.classList.remove('ok'); xBusy = false;
  xRender();
  if (!xdlg.open) xdlg.showModal();
  xdlg.querySelector('input[name="xfmt"]:checked')?.focus({ preventScroll: true });
}
$('#xOpts').addEventListener('change', (e) => { xFmt = e.target.value; localStorage.setItem(`foxy.export.fmt.${xScope.kind}`, xFmt); xSync(); });
$('#xGo').onclick = async () => {
  const go = $('#xGo'), fmt = exportFormats(xScope).find((f) => f.id === xFmt); if (!fmt) return;
  const settle = () => { xBusy = false; go.disabled = false; go.classList.remove('ok'); xSync(); };
  xBusy = true; go.disabled = true;
  try {
    go.textContent = await fmt.run(); go.classList.add('ok');
    // A download is done once it is saved, so the dialog goes. A copy leaves it open to copy again or pick something else.
    setTimeout(() => { if (fmt.keepOpen) settle(); else { if (xdlg.open) xdlg.close(); settle(); } }, fmt.keepOpen ? 1400 : 650);
  } catch { go.textContent = 'Failed'; setTimeout(settle, 1400); }
};
$('#xCancel').onclick = $('#xClose').onclick = () => xdlg.close();
xdlg.addEventListener('click', (e) => { if (e.target === xdlg) xdlg.close(); }); // the backdrop
xdlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type="radio"]')) { e.preventDefault(); $('#xGo').click(); } });
$('#export').onclick = () => openExport({ kind: 'capture' });
