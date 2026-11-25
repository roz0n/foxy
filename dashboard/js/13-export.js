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
function requestsCsv(list = [...reqs.values()].filter(match)) {
  const head = ['ID', 'Time (s)', 'Clock', 'Phase', 'Method', 'Host', 'Path', 'Query', 'Status', 'Error', 'Duration (ms)', 'Size (bytes)', 'Identical dupe', 'Code owners', 'Via', 'Screen', 'Call site', 'Started from'];
  return toCsv(head, [...list].sort((a, b) => a.relMs - b.relMs).map((r) => [
    r.id, Number(sec(r.relMs)), clock(r.ts), phaseByKey.get(r.key)?.label || '', r.method, r.host, r.path, r.query || '',
    r.status ?? '', r.error || '', r.durationMs == null ? null : Math.round(r.durationMs), r.sizeBytes ?? null, dupeCounts.get(reqKey(r)) > 1,
    ownersText(r), (r.ownerCodeOwners || []).map(team).join(' '), r.view ? (r.view.ready ? r.view.route : 'App start-up') : '', siteText(r.callSiteInfo), siteText(r.ownerInfo),
  ]));
}
function endpointsCsv(list = [...reqs.values()].filter(match)) {
  const head = ['Phase', 'Endpoint', 'Method', 'Host', 'Path', 'Calls', 'Identical dupes', 'Failed', 'Statuses', 'Avg (ms)', 'P95 (ms)', 'Bytes', 'First call (s)', 'Code owners', 'Call site', 'Verdict', 'Reason'];
  const groups = buildGroups(list).sort((a, b) => a.first - b.first);
  return toCsv(head, groups.map((g) => {
    const v = auditOf(phaseOfGroup(g), g.k), site = [...g.sites.values()][0]?.info;
    return [
      phaseOfGroup(g)?.label || '', g.k, g.method, g.host, g.path, g.n, g.dupes, g.failed, Object.entries(g.st).map(([s, n]) => `${s === '…' ? 'pending' : s}x${n}`).join(' '),
      g.avg, g.p95 == null ? null : Math.round(g.p95), g.bytesTotal, Number(sec(g.first)), g.ownerText, siteText(site),
      VERDICTS.find((x) => x.id === v.v)?.label || '', v.note || '',
    ];
  }));
}

// ---- Export dialog: every download button opens it. Pick a format, then Export. ----
const xdlg = $('#exportDlg');
let xScope = null, xFmt = '';
const phaseReqs = (ph) => [...reqs.values()].filter((r) => phaseByKey.get(r.key)?.id === ph.id);
/** The formats on offer for a scope. `run` does the work and returns the label to flash. */
function exportFormats(scope) {
  const ph = scope.kind === 'phase' ? phases.find((p) => p.id === scope.id) : null;
  const slug = ph ? slugOf(ph.label) : 'capture', stamp = fileStamp();
  const list = () => (ph ? phaseReqs(ph) : $('#xFilterOn').checked ? [...reqs.values()].filter(match) : [...reqs.values()]);
  const save = (text, name, type) => { downloadText(text, name, type); return 'Saved'; };
  const json = {
    id: 'json', title: 'JSON, full detail', tag: '.json', verb: 'Download JSON',
    desc: ph ? `Every request with headers, bodies and the call chain, plus the phase totals${ph.end === Infinity ? ' (still capturing: what has arrived so far)' : ''}.` : 'The whole session: every request in full, the markers and the phases. Ignores filters.',
    run: async () => { await downloadFromServer(ph ? '/api/export/phase?marker=' + encodeURIComponent(ph.id) : '/api/export/capture', 'foxy-export.json'); return 'Saved'; },
  };
  const csvReq = { id: 'csv-req', title: 'CSV, one row per request', tag: '.csv', verb: 'Download CSV', desc: 'Time, phase, method, host, path, status, duration, size, owners and call site. Opens in a spreadsheet.', run: () => save(requestsCsv(list()), `foxy-${slug}-requests-${stamp}.csv`, 'text/csv;charset=utf-8') };
  const csvEp = { id: 'csv-ep', title: 'CSV, one row per endpoint', tag: '.csv', verb: 'Download CSV', desc: 'Calls, dupes, failures, timings, owners and call site, with the verdict and reason you gave each one.', run: () => save(endpointsCsv(list()), `foxy-${slug}-endpoints-${stamp}.csv`, 'text/csv;charset=utf-8') };
  const md = { id: 'md', title: 'Markdown table', tag: 'copies', verb: 'Copy Markdown', desc: 'A table to paste wherever you are writing this up.', run: async () => { await copyText(ph ? auditMarkdown(ph) : endpointsMarkdown(list())); return 'Copied!'; } };
  if (!ph) return [json, csvReq, csvEp, md];
  const agent = { id: 'agent', title: 'JSON for an agent', tag: '.json', verb: 'Download JSON', desc: 'Verdicts, reasons and call sites, with instructions an AI agent can act on. Agents can also read it themselves (audit_get).', run: async () => { await flushAudits().catch(() => {}); await downloadFromServer('/api/audit/export?phase=' + encodeURIComponent(ph.id), `foxy-audit-${slug}.json`); return 'Saved'; } };
  return [json, csvReq, csvEp, md, agent];
}
function xRender() {
  const fmts = exportFormats(xScope);
  if (!fmts.some((f) => f.id === xFmt)) xFmt = fmts[0].id;
  $('#xOpts').innerHTML = fmts.map((f) => `<label class="xopt"><input type="radio" name="xfmt" value="${f.id}" ${f.id === xFmt ? 'checked' : ''} /><span class="xt">${esc(f.title)}</span><span class="xtag">${esc(f.tag)}</span><span class="xd">${esc(f.desc)}</span></label>`).join('');
  const go = $('#xGo'); go.textContent = fmts.find((f) => f.id === xFmt).verb;
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
  const go = $('#xGo'); go.disabled = false; go.classList.remove('ok');
  xRender();
  if (!xdlg.open) xdlg.showModal();
  xdlg.querySelector('input[name="xfmt"]:checked')?.focus();
}
$('#xOpts').addEventListener('change', (e) => { xFmt = e.target.value; localStorage.setItem(`foxy.export.fmt.${xScope.kind}`, xFmt); xRender(); xdlg.querySelector('input[name="xfmt"]:checked')?.focus(); });
$('#xGo').onclick = async () => {
  const go = $('#xGo'), fmt = exportFormats(xScope).find((f) => f.id === xFmt); if (!fmt) return;
  go.disabled = true;
  try { go.textContent = await fmt.run(); go.classList.add('ok'); setTimeout(() => { if (xdlg.open) xdlg.close(); }, 650); }
  catch { go.textContent = 'Failed'; setTimeout(() => { go.disabled = false; xRender(); }, 1400); }
};
$('#xCancel').onclick = $('#xClose').onclick = () => xdlg.close();
xdlg.addEventListener('click', (e) => { if (e.target === xdlg) xdlg.close(); }); // the backdrop
xdlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type="radio"]')) { e.preventDefault(); $('#xGo').click(); } });
$('#export').onclick = () => openExport({ kind: 'capture' });
