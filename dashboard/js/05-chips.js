// Copy buttons, duplicate keys, ownership categories, team and package chips, GitHub links and call-site cells.
const clip = [];
const ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx="2.2" opacity=".5"/><rect x="5.5" y="5.5" width="9" height="9" rx="2.2"/></svg>';
const CHECK = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M6.2 12.5 2.2 8.5l1.45-1.45 2.55 2.55 6.15-6.15 1.45 1.45z"/></svg>';
function cp(text, title, o = {}) {
  clip.push(String(text));
  const cls = ['cp', o.ho && 'ho', o.right && 'right', o.label && 'lab', o.abs && 'abs', o.abs === 'tr' && 'tr'].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}" data-cp="${clip.length - 1}" data-label="${esc(o.label || '')}" title="${esc(title)}" aria-label="${esc(title)}">${ICON}${o.label ? `<span>${esc(o.label)}</span>` : ''}</button>`;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return; } catch {}
  const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
}
// capture phase so a copy click never toggles the row / <details> underneath it
document.addEventListener('click', async (e) => {
  const b = e.target.closest('.cp'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  await copyText(clip[Number(b.dataset.cp)] ?? '');
  const before = b.innerHTML; b.classList.add('copied'); b.innerHTML = CHECK + (b.dataset.label ? '<span>Copied</span>' : '');
  setTimeout(() => { if (b.isConnected) { b.classList.remove('copied'); b.innerHTML = before; } }, 1200);
}, true);
const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Same rule as lib.mjs: GET-like requests are identical by URL; POST-like only when the body fingerprint matches (never when unknown). */
const dupeKey = (r) => (IDEMPOTENT.has(r.method) ? `${r.method} ${r.url}` : r.bodyKey ? `${r.method} ${r.url} ${r.bodyKey}` : `unique:${r.key}`);
const reqKey = dupeKey;
const isFailed = (r) => Boolean(r.error) || r.status >= 400;
/** ours = a CODEOWNERS team owns the call site, third = inside a third-party package, unowned = neither. */
const category = (r) => ((r.codeOwners || []).length ? 'ours' : r.callSiteInfo?.kind === 'package' ? 'third' : 'unowned');
const stClass = (r) => (r.error ? 'err' : r.status ? 's' + String(r.status)[0] : 'pending');

// Stable per-team colors from the MetaMask design-system palette.
const PALETTE = ['#8b99ff', '#c66ef5', '#ff7940', '#f0b034', '#b9f302', '#ff7584', '#4cb564', '#6f7eff', '#e1a9ff', '#ffc0a5', '#80cb91', '#ffd957'];
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const teamColor = (t) => PALETTE[hash(team(t)) % PALETTE.length];

// `via` marks the team that owns the CALLER behind the call site (the "↳" line under Call Site) rather than the file that made the request. It is shown
// as a dashed, arrow-led chip next to the solid one for the call site's own team, and the tooltip says so in words (the guide has the same explanation).
const VIA_TIP = 'Via: this team owns the caller behind the call site (the \u21b3 line under Call Site), usually the hook or component that started the request through someone else\u2019s code. The solid chip is the team that owns the file that made the request.';
const teamChip = (o, via) => `<span class="chip ${via ? 'via' : ''}" data-team="${esc(o)}" style="--c:${teamColor(o)}" title="${esc(o)}${via ? `\n${esc(VIA_TIP)}` : ''}"><span class="t">${esc(team(o))}</span></span>`;
function partyChip(pkg) {
  const m = String(pkg).match(/^(@[^/]+\/)?(.+)$/);
  return `<span class="chip party" data-pkg="${esc(pkg)}" title="Third-party package: ${esc(pkg)}"><span class="t">${m[1] ? `<span class="scope">${esc(m[1])}</span>` : ''}${esc(m[2])}</span></span>`;
}
const extChip = (pkg) => `<span class="chip mm" data-pkg="${esc(pkg)}" title="${esc(pkg)}: no CODEOWNERS entry found (maintained outside core?)"><span class="t">${esc(String(pkg).replace(/^@metamask\//, ''))}</span></span>`;
const warnChip = (text, title) => `<span class="chip warn" title="${esc(title)}"><span class="t">${esc(text)}</span></span>`;
const noneChip = (text, title) => `<span class="chip none" title="${esc(title || '')}"><span class="t">${esc(text)}</span></span>`;

/** Chips for a frame: its teams, else the package it came from, then the teams of the caller behind it (the "↳" frame) that are not already shown. `max` caps the count with a +N chip. */
function ownerChips(info, owners, viaOwners, max) {
  const out = [];
  const add = (html, name) => out.push({ html, name });
  if (owners && owners.length) owners.forEach((o) => add(teamChip(o, false), team(o)));
  else if (info) {
    if (info.kind === 'package') add(partyChip(info.pkg), info.pkg);
    else if (info.kind === 'controller') add(extChip(info.pkg), info.pkg);
    else if (info.kind === 'app' || info.kind === 'project') add(warnChip('unowned', `${info.file} has no CODEOWNERS entry`), 'unowned');
    else if (info.unsymbolicated) add(noneChip('unsymbolicated', 'Metro could not symbolicate this frame'), 'unsymbolicated');
  }
  (viaOwners || []).filter((o) => !(owners || []).includes(o)).forEach((o) => add(teamChip(o, true), `${team(o)} (via caller)`));
  if (max && out.length > max) {
    const rest = out.slice(max);
    return out.slice(0, max).map((x) => x.html).join('') + noneChip(`+${rest.length}`, rest.map((x) => x.name).join(', '));
  }
  return out.map((x) => x.html).join('');
}
/** Every team behind a request: the call site's, then the caller's that differ. */
const effectiveTeams = (r) => [...(r.codeOwners || []), ...(r.ownerCodeOwners || []).filter((o) => !(r.codeOwners || []).includes(o))];
const rowChips = (r) => `<div class="chips">${ownerChips(r.callSiteInfo, r.codeOwners, r.ownerCodeOwners, 3) || noneChip('—')}</div>`;

/** GitHub status from the server: { repo, ref }. Call-site links need it, so they simply stay plain text until it loads. */
let gh = null;
fetch('/api/status').then((r) => r.json()).then((s) => { gh = s.github || null; renderBuild(s.build); schedule(); }).catch(() => {});
/** The version and checkout Foxy runs from, at the foot of the menu, so a capture can be matched to the code that made it. */
function renderBuild(b) {
  if (!b || !b.version) return;
  const el = $('#buildInfo');
  const bits = [`Foxy ${b.version}`, b.branch, b.commit].filter(Boolean);
  el.innerHTML = bits.map((x) => `<span>${esc(x)}</span>`).join('<i>·</i>') + (b.dirty ? '<span class="dirty">uncommitted changes</span>' : '');
  el.title = `Running from ${b.branch || 'a detached HEAD'} at ${b.commit || 'an unknown commit'}${b.dirty ? ', with uncommitted changes' : ''}`;
  el.hidden = false;
}
/** Link to the exact line on GitHub. Only the project's own files (app/..., index.js, ...) live there; packages and bundles do not. */
function ghUrl(info) {
  if (!gh || !info || !info.file || (info.kind !== 'app' && info.kind !== 'project')) return null;
  if (/^(\/|https?:|\.\.)/.test(info.file) || info.file.includes('node_modules/')) return null;
  const path = info.file.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${gh.repo}/blob/${gh.ref}/${path}${info.line ? `#L${info.line}` : ''}`;
}

/** Last two path segments + :line:col, e.g. `providers/Foo.ts:55:23`. */
function fileTail(info) {
  const parts = String(info.file || '').split('/');
  const tail = parts.slice(-2).join('/');
  return { tail, loc: info.line ? `:${info.line}:${info.col}` : '' };
}
/** A call site as a compact cell. Table rows stay quiet; `copy` adds the hover copy button where there is room for it (detail panels).
 *  `bar: false` drops the kind colour, for table rows that show it on their leading edge instead. */
function fnCell(info, sub, { copy = false, bar = true } = {}) {
  if (!info) return '<span class="dim">(no stack)</span>';
  const t = fileTail(info);
  const where = `${info.file}:${info.line}:${info.col}`;
  return `<div class="fn${copy ? ' hv' : ''}${sub ? ' sub' : ''}">${bar ? `<span class="bar ${esc(kindOf(info))}"></span>` : ''}<div class="fn-text"><div class="fn-name">${fnLabel(info.method)}</div><div class="fn-file">${esc(t.tail)}<span class="loc">${esc(t.loc)}</span></div></div>${copy ? cp(where, 'Copy file:line:col', { ho: true, abs: true }) : ''}</div>`;
}
/** The highlight button in an open request's detail: just the icon, filled when the request is highlighted. */
const hlSwitch = (key) => { const on = highlights.has(key); return `<button type="button" class="hl-switch" data-hl="${esc(key)}" aria-pressed="${on}" aria-label="Highlight this request" title="${on ? 'Remove highlight' : 'Highlight'} (H)"><svg class="ic"><use href="#i-hl"/></svg></button>`; };
/** Highlights a request or removes its highlight. */
function toggleHighlight(key) {
  highlights.has(key) ? highlights.delete(key) : highlights.add(key);
  saveHighlights();
  if (ui.hl && !highlights.size) ui.hl = false; // nothing left to show
  render();
}
/** A frame's kind for colouring (app, controller, package, project), or unsym when it could not be symbolicated. */
const kindOf = (info) => (!info ? 'none' : info.unsymbolicated ? 'unsym' : info.kind);
/**
 * The Timeline's Call Site cell: the function that called fetch, and under it what called that function when the stack still has it
 * (the hook or component, else the next controller method). When it does not, the second line is the call site's file, as before.
 */
function siteCell(site, caller) {
  if (!site) return '<span class="dim">(no stack)</span>';
  const t = fileTail(site);
  const file = String(caller?.file || '').split('/').pop(), line = caller?.line ? `:${caller.line}` : '';
  const anon = caller && String(caller.method).startsWith('<'); // an anonymous callback: the file (the hook) says more than its name
  const second = caller
    ? `<div class="fn-caller k-${esc(kindOf(caller))}"><span class="arw">\u21b3</span>${anon ? `<span class="fnm">${esc(file)}</span><span class="loc">${line}</span>` : `<span class="fnm">${fnLabel(caller.method)}</span><span class="loc">${esc(file)}${line}</span>`}</div>`
    : `<div class="fn-file">${esc(t.tail)}<span class="loc">${esc(t.loc)}</span></div>`;
  return `<div class="fn"><div class="fn-text"><div class="fn-name">${fnLabel(site.method)}</div>${second}</div></div>`;
}
const siteTitle = (site, caller) => (!site ? '' : `${fnTitle(site)}\n${caller ? `called from ${fnTitle(caller)}` : 'no earlier caller in the stack (it usually ends at an await)'}`);
const fnLabel = (name) => `${esc(name)}${String(name).startsWith('<') ? '' : '<span class="paren">()</span>'}`;
const fnTitle = (info) => (info ? `${info.method}()  ${info.file}:${info.line}:${info.col}` : '');

const haystack = (r) => [r.host, r.path, r.method, r.callSite, r.owner, r.callSiteInfo?.pkg, r.callSiteInfo?.method, r.view?.route, ...(r.codeOwners || []), ...(r.ownerCodeOwners || [])].join(' ').toLowerCase();
const ownerMatch = (r) => {
  const o = ui.owner; if (!o) return true;
  if (o.type === 'team') return [...(r.codeOwners || []), ...(r.ownerCodeOwners || [])].some((x) => team(x) === o.value);
  return r.callSiteInfo?.pkg === o.value;
};
