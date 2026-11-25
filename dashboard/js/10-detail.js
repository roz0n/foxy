// ============================================================================
// detail panel: call chain + request / response
// ============================================================================
function fetchDetail(key) {
  const r = reqs.get(key); if (!r) return null;
  const stamp = `${r.status}|${r.durationMs}|${r.error}|${r.callSite}`;
  const cached = detailCache.get(key);
  if (cached && cached.stamp === stamp) return cached.data;
  if (!cached || !cached.loading) {
    detailCache.set(key, { stamp, data: cached?.data ?? null, loading: true });
    fetch('/api/requests/' + encodeURIComponent(key)).then((res) => res.ok ? res.json() : null).then((data) => {
      detailCache.set(key, { stamp, data, loading: false }); schedule();
    });
  }
  return cached?.data ?? null;
}

const kvTable = (obj) => {
  const rows = Object.entries(obj || {});
  if (!rows.length) return '';
  return `<div class="kv">${rows.map(([k, v]) => {
    const red = v === '[redacted]';
    return `<div class="r hv"><div class="k">${esc(k)}</div><div class="v ${red ? 'redacted' : ''}">${esc(v)}${red || v === '' ? '' : cp(v, `Copy ${k}`, { ho: true })}</div></div>`;
  }).join('')}</div>`;
};
const kvLines = (obj, sep) => Object.entries(obj || {}).map(([k, v]) => `${k}${sep}${v}`).join('\n');
function toCurl(r, req) {
  const q = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;
  const lines = [`curl -X ${r.method} ${q(r.url)}`];
  for (const [k, v] of Object.entries(req?.headers || {})) lines.push(`  -H ${q(`${k}: ${v}`)}`);
  if (req?.bodyPreview != null) lines.push(`  --data-raw ${q(req.bodyPreview)}`);
  return lines.join(' \\\n');
}
function prettyBody(text) {
  if (text == null) return null;
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}
// JSON syntax highlighting: tolerant of truncated previews (an unterminated string still colours), plain text passes through untouched
const JSON_TOKEN = /("(?:\\.|[^"\\\n])*"?)(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|[{}\[\],]/g;
function highlightJson(text) {
  let out = '', last = 0, m;
  JSON_TOKEN.lastIndex = 0;
  while ((m = JSON_TOKEN.exec(text))) {
    out += esc(text.slice(last, m.index)); last = JSON_TOKEN.lastIndex;
    const t = m[0];
    if (m[1] !== undefined) out += `<span class="${m[2] ? 'jk' : 'js'}">${esc(m[1])}</span>${m[2] ? `<span class="jp">${esc(m[2])}</span>` : ''}`;
    else out += `<span class="${t === 'true' || t === 'false' ? 'jb' : t === 'null' ? 'jn' : /^-?\d/.test(t) ? 'jnum' : 'jp'}">${esc(t)}</span>`;
  }
  return out + esc(text.slice(last));
}
const bodyBlock = (text, label) => { if (text == null) return ''; const pb = prettyBody(text); return `<div class="bodywrap hv"><pre class="body" aria-label="${esc(label)}">${/^\s*[\[{]/.test(pb) ? highlightJson(pb) : esc(pb)}</pre>${cp(pb, `Copy ${label}`, { abs: 'tr', ho: true })}</div>`; };

function queryParams(url) {
  try { return Object.fromEntries([...new URL(url).searchParams.entries()]); } catch { return {}; }
}

/** The path and :line:col of a stack frame, linked to that line on GitHub when the file is ours. */
function fileLink(f) {
  const text = `${esc(f.file)}<span class="loc">${esc(f.line ? ':' + f.line + ':' + f.col : '')}</span>`;
  // Package frames carry their GitHub link from the server (the source line behind the bundled file, when it resolves)
  const pkg = f.link;
  const url = pkg ? pkg.url : ghUrl(f);
  const title = pkg ? `Open ${pkg.text} on GitHub` : `Open ${f.file}${f.line ? ' at line ' + f.line : ''} on GitHub`;
  return url ? `<a class="gh" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(title)}">${text}</a>` : text;
}

function renderChain(r, d) {
  if (!d) return '<div class="dim">Loading…</div>';
  const real = d.frames.filter((f) => f.kind !== 'infra');
  const infra = d.frames.filter((f) => f.kind === 'infra');
  if (!real.length) return '<div class="dim">No JavaScript frames survived (the call crossed an async boundary before reaching fetch).</div>';
  const callSite = real[0];
  // The server picked it (r.ownerInfo): the caller shown beside the call site, else the nearest app or @metamask frame after it
  const sameFrame = (f, o) => o && f.method === o.method && f.file === o.file && f.line === o.line;
  const starter = real.slice(1).find((f) => sameFrame(f, r.ownerInfo)) || real.slice(1).find((f) => f.kind === 'app' || f.kind === 'controller');
  const nodes = real.slice().reverse().map((f) => {
    const isCall = f === callSite, isStarter = f === starter;
    const kind = f.unsymbolicated ? 'unsymbolicated' : f.kind;
    const role = isCall ? '<span class="role cs">call site</span>' : isStarter ? '<span class="role">started from</span>' : '';
    const chips = ownerChips(f, f.owners, null);
    return `<div class="node k-${esc(kind)} ${isCall ? 'callsite' : ''}"><div class="rail"><span class="dot"></span></div><div class="hv">
      <div class="fn-name">${fnLabel(f.method)}${role}</div>
      <div class="nfile" title="${esc(f.file)}">${fileLink(f)}${cp(`${f.file}${f.line ? ':' + f.line + ':' + f.col : ''}`, 'Copy file:line:col', { ho: true })}</div>
      ${chips ? `<div class="chips">${chips}</div>` : ''}</div></div>`;
  }).join('');
  const net = `<div class="node net"><div class="rail"><span class="dot"></span></div><div><div class="fn-name">${esc(r.transport === 'xhr' ? 'XMLHttpRequest' : 'fetch')}<span class="paren">()</span><span class="role" style="background:var(--color-success-muted);color:var(--color-success-default)">network</span></div><div class="nfile">${esc(r.method)} ${esc(r.host + r.path)}</div></div></div>`;
  const wrappers = infra.length ? `<details class="wrappers"><summary>${infra.length} wrapper / native / promise frames hidden</summary>${infra.map((f) => `<div>${esc(f.display || f.raw || '')}</div>`).join('')}</details>` : '';
  const legend = `<div class="legend"><span><i style="background:var(--kind-app)"></i>app</span><span><i style="background:var(--kind-controller)"></i>@metamask package</span><span><i style="background:var(--kind-package)"></i>third-party</span><span><i style="background:var(--kind-project)"></i>project file</span></div>`;
  return `<div class="chain-note">Oldest caller first. The stack ends where an <code>await</code> hid earlier callers.</div>${nodes}${net}${wrappers}${legend}`;
}

/** The panel's header actions: copy the URL, or the whole request as cURL. */
function ioActions(r, d) {
  return `${cp(r.url, 'Copy full URL', { label: 'Copy URL', right: true })}${cp(toCurl(r, d?.detail?.request), 'Copy as cURL (header values already redacted)', { label: 'Copy cURL' })}`;
}

function renderIO(r, d) {
  const req = d?.detail?.request, res = d?.detail?.response;
  const qp = queryParams(r.url), qn = Object.keys(qp).length;
  const hdrReq = req?.headers, hdrRes = res?.headers;
  const bodyOff = '<div class="hint">Body capture is off. Set <code>FOXY_BODIES="true"</code> in <code>.js.env</code> to record request and response previews.</div>';
  const size = (o) => (o ? Object.keys(o).length : 0);
  // One kind of row for everything: a title, a quiet detail, a copy button that shows on hover. A row with nothing to show says so and does not expand.
  const row = (title, { count = '', none = '', body = '', open = false, copy, copyTitle }) => (body
    ? `<details class="row" ${open ? 'open' : ''}><summary class="hv"><span>${title}</span>${count !== '' ? `<span class="cnt">${count}</span>` : ''}${copy ? cp(copy, copyTitle, { right: true, ho: true }) : ''}</summary><div class="rb">${body}</div></details>`
    : `<details class="row static"><summary><span>${title}</span><span class="cnt">${none}</span></summary></details>`);
  const headers = (h, copyTitle) => row('Headers', { count: size(h), none: d ? 'None captured' : 'Loading…', body: size(h) ? kvTable(h) : '', copy: kvLines(h, ': '), copyTitle });
  const na = '<span class="na">—</span>';
  const meta = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const overview = `<div class="ov"><div class="ov-line"><span class="meth">${esc(r.method)}</span><span class="url"><b>${esc(r.host)}</b>${esc(r.path)}</span>${hlSwitch(r.key)}</div>
    <dl class="ov-meta">${meta('Status', stPill(stClass(r), r.error ? 'error' : r.status ?? '…', stBucket(r.error ? 'error' : r.status), res?.statusText || ''))}${meta('Date', esc(dayOf(r.ts)))}${meta('Started', `<span title="${esc(fullTime(r.ts))}">${esc(clock(r.ts))}</span> <span class="dim">+${tf(r.relMs)}</span>`)}${meta('Finished', r.durationMs != null ? `<span title="${esc(fullTime(r.ts + r.durationMs))}">${esc(clock(r.ts + r.durationMs))}</span>` : na)}${meta('Duration', r.durationMs != null ? fmtMs(r.durationMs) : na)}${meta('Size', r.sizeBytes != null ? bytes(r.sizeBytes) : na)}${meta('Via', esc(r.transport || 'fetch'))}</dl></div>`;
  const request = `<section class="io-sec"><h4>Request</h4>
    ${qn ? row('Query parameters', { count: qn, body: kvTable(qp), open: true, copy: kvLines(qp, '='), copyTitle: 'Copy all query parameters' }) : ''}
    ${headers(hdrReq, 'Copy request headers')}
    ${req?.bodyPreview != null ? row('Body', { count: req.bodyBytes != null ? bytes(req.bodyBytes) : '', body: bodyBlock(req.bodyPreview, 'request body'), open: true })
      : req?.bodyBytes ? row('Body', { count: bytes(req.bodyBytes), body: bodyOff }) : row('Body', { none: d ? 'None' : 'Loading…' })}</section>`;
  const response = `<section class="io-sec"><h4>Response</h4>${r.error ? `<div class="io-err">${esc(r.error)}</div>` : ''}
    ${headers(hdrRes, 'Copy response headers')}
    ${res?.bodyPreview != null ? row('Body', { count: res.bodyBytes != null ? bytes(res.bodyBytes) : '', body: bodyBlock(res.bodyPreview, 'response body'), open: true })
      : d ? row('Body', { count: res?.bodyBytes != null ? bytes(res.bodyBytes) : 'Not captured', body: bodyOff }) : row('Body', { none: 'Loading…' })}</section>`;
  return `<div class="io">${overview}${request}${response}</div>`;
}

/** Readable stack, innermost first, wrappers omitted. */
function stackText(r, d) {
  const real = d.frames.filter((f) => f.kind !== 'infra');
  return [`${r.method} ${r.url}`, ...real.map((f) => `  at ${f.method}() (${f.file}:${f.line}:${f.col})`)].join('\n');
}

/** Where each screen is defined in the app source. Looked up on the server and cached; refreshed now and then so line numbers follow edits. */
const viewSrc = new Map(); // route -> { at, source, loading }
function viewSource(route) {
  if (!route) return null;
  const c = viewSrc.get(route);
  if (!c || (!c.loading && Date.now() - c.at > 30000)) {
    const keep = c?.source ?? null, done = (source) => { viewSrc.set(route, { at: Date.now(), source, loading: false }); schedule(); };
    viewSrc.set(route, { at: Date.now(), source: keep, loading: true });
    fetch('/api/view?route=' + encodeURIComponent(route)).then((res) => (res.ok ? res.json() : null)).then((d) => done(d?.source ?? keep), () => done(keep));
  }
  return viewSrc.get(route).source;
}
/** `Views/Settings/index.tsx:52`, linked to that line on GitHub when it can be. */
function sourceLink(s) {
  const parts = String(s.file).split('/'), text = `${parts.slice(-2).join('/')}:${s.line}`, url = ghUrl({ file: s.file, line: s.line, kind: 'app' });
  return url
    ? `<a class="gh" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Open ${esc(s.file)} at line ${s.line} on GitHub">${esc(text)}${icon('external')}</a>`
    : `<span title="${esc(`${s.file}:${s.line}`)}">${esc(text)}</span>`;
}

/** Where in the app the request was made: the focused screen, how it got there, and how long it had been showing. */
function viewStrip(r) {
  const v = r.view;
  if (!v) return `<div class="vstrip none">${icon('screen')}<span class="vk">Launched from</span><span class="vsub">Not reported. Rebuild and restart the app to record which screen each request comes from.</span></div>`;
  const chip = (text, cls, tip) => `<span class="vchip ${cls || ''}" title="${esc(tip || '')}">${esc(text)}</span>`;
  const chips = [];
  if (v.ready && v.screenAgeMs != null) {
    const fresh = v.screenAgeMs < 500;
    chips.push(chip(fresh ? `fired ${dur(v.screenAgeMs)} after the screen opened` : `on screen for ${dur(v.screenAgeMs)}`, fresh ? 'fresh' : '', fresh ? 'Made right as the screen appeared: most likely triggered by mounting it' : 'How long this screen had been showing when the request was made'));
  }
  if (v.appState && v.appState !== 'active') chips.push(chip(`app ${v.appState}`, 'warn', 'The app was not in the foreground'));
  if (v.params?.length) chips.push(chip(`params: ${v.params.join(', ')}`, '', 'Names of the screen params (values are never recorded)'));
  const name = v.ready ? v.route : 'Before navigation was ready';
  const sub = v.ready ? (v.path.length > 1 ? v.path.join('  ›  ') : '') : 'App start-up: the navigator had not mounted yet, so no screen was showing.';
  // the screen's source file and line, plus where it is registered in a navigator when that is a different place
  const src = v.ready ? viewSource(v.route) : null, reg = src?.registeredIn;
  const where = src ? [
    `<span class="vsrc"><span class="vsrck">${src.guess ? 'Best match' : src.resolved ? 'Defined in' : 'Registered in'}</span>${sourceLink(src)}</span>`,
    reg && src.resolved && (reg.file !== src.file || reg.line !== src.line) ? `<span class="vsrc"><span class="vsrck">Registered in</span>${sourceLink(reg)}</span>` : '',
  ].join('') : '';
  const row = sub || where ? `<div class="vsub">${sub ? `<span>${esc(sub)}</span>` : ''}${where}</div>` : '';
  return `<div class="vstrip">${icon('screen')}<span class="vk">Launched from</span><span class="vname ${v.ready ? '' : 'boot'}">${esc(name)}</span>${chips.join('')}${row}</div>`;
}

/** The screen a request was made from, as a table cell: its name, the navigators above it, and a flag when it fired as the screen mounted. */
function viewCell(v) {
  if (!v) return '<span class="dim">(not reported)</span>';
  if (!v.ready) return '<div class="fn"><div class="fn-text"><div class="fn-name boot">App start-up</div><div class="fn-file">before navigation was ready</div></div></div>';
  const above = (v.path || []).slice(0, -1).slice(-2).join(' \u203a '); // the two navigators just above the screen
  const mount = v.screenAgeMs != null && v.screenAgeMs < 500 ? '<span class="mount" title="Made right as the screen appeared: most likely triggered by mounting it">on mount</span>' : '';
  return `<div class="fn"><div class="fn-text"><div class="fn-name">${esc(v.route)}</div><div class="fn-file">${mount}${above && mount ? ' · ' : ''}${esc(above)}</div></div></div>`;
}
const viewTitle = (v) => (!v ? 'The app build did not report which screen this came from' : !v.ready ? 'App start-up: the navigator had not mounted yet' : `${(v.path || []).join(' \u203a ')}${v.screenAgeMs != null ? `\n${v.screenAgeMs < 500 ? 'fired' : 'on screen for'} ${dur(v.screenAgeMs)}${v.screenAgeMs < 500 ? ' after the screen opened' : ''}` : ''}`);

function renderDetailRow(r, cols) {
  const d = fetchDetail(r.key);
  return `<tr class="detail${enterKey === r.key ? ' enter' : ''}"><td colspan="${cols}">${viewStrip(r)}<div class="dgrid">
    <section class="panel"><h3>Call Chain${d ? cp(stackText(r, d), 'Copy stack trace', { right: true, label: 'Copy Stack' }) : ''}</h3>${renderChain(r, d)}</section>
    <section class="panel"><h3>Request &amp; Response${ioActions(r, d)}</h3>${renderIO(r, d)}</section></div></td></tr>`;
}
