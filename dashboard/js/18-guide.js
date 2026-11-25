// ============================================================================
// help window. Add a topic to HELP and it shows up in the nav; openHelp('id') deep-links to it
// from anywhere (the marker panel does this). Illustrations are the ART strings above.
// ============================================================================
const art = (name, label) => `<pre class="art" role="img" aria-label="${esc(label)}">${ART[name]}</pre>`;
const step = (n, title, body) => `<div class="step"><span class="no">${n}</span><div class="sb"><h4>${title}</h4>${body}</div></div>`;
const kb = (x) => `<kbd class="k">${x}</kbd>`;
const goto = (id, label) => `<button type="button" class="btn" data-topic="${id}">${label}</button>`;
const HELP = [
  { id: 'start', em: '🚀', title: 'Start Here', html: () => `
    <h2>Welcome to Foxy</h2>
    <p class="lede">Foxy shows every network request the app makes, which line of code made it, and which team owns that code. It is built to answer one question: <b>what is the app doing on the network, and does it need to?</b></p>
    ${art('flow', 'The app sends its requests to Foxy, which shows them in the Timeline, Endpoints and Markers views')}
    ${step(1, 'Run the App Against Foxy', '<p>Open Foxy and choose your MetaMask Mobile folder (it sets <code>FOXY="true"</code> in <code>.js.env</code>), restart Metro and launch the app. Requests stream in live.</p>')}
    ${step(2, 'Label What You Are Doing', `<p>Drop <b>markers</b> as you use the app (${kb('M')}). They split the capture into phases such as <i>Onboarding visible</i> and <i>Wallet ready</i>.</p><p>${goto('markers', '🚩 How Markers Work')}</p>`)}
    ${step(3, 'Find the Waste', `<p>Look for identical duplicates, failures, third-party chatter and anything requested before it is needed. The <b>Endpoints</b> view (${kb('2')}) groups calls by URL so repeats are obvious. ${kb('1')} brings you back to the Timeline.</p><p>${goto('timeline', '📜 Reading the Timeline')} ${goto('endpoints', '🧭 Endpoints & Verdicts')}</p>`)}
    ${step(4, 'Decide and Share', '<p>Give each endpoint a verdict (Keep, Defer, Move, Drop) and a reason, then <b>Export</b> the phase as a markdown table to share. Verdicts are per phase: open <b>Endpoints</b>, focus a phase and turn on <b>Audit</b> to see the Verdict column and give verdicts for that phase.</p>')}` },

  { id: 'markers', em: '🚩', title: 'Markers & Phases', html: () => `
    <h2>Markers &amp; Phases</h2>
    <p class="lede">A marker is a flag you drop while you use the app. Everything captured after it belongs to that <b>phase</b>, until the next marker. That is how you answer <i>“which requests happen on Onboarding?”</i> instead of scrolling through hundreds of rows.</p>
    ${art('concept', 'Three markers split the timeline into three phases, each with its own request activity')}
    ${step(1, 'Drop a Marker When Something Happens', `<p>Press ${kb('M')} anywhere or click <b>Markers</b> in the toolbar. Type what just happened and press ${kb('Enter')}, or tap a quick-add chip. Your own labels are remembered as chips too.</p><p>Noticed late? Choose <b>5s ago</b>, <b>30s ago</b>… in the dropdown and the marker is placed in the past.</p>${art('popover', 'The markers panel with a label field, a time dropdown, quick-add chips and the list of markers')}`)}
    ${step(2, 'See the Phases', `<p>Every phase gets a colour. The <b>activity strip</b> shades each phase and labels its flag (click a flag on the Timeline to jump to it; on Endpoints it focuses that phase, and again to clear). The <b>waterfall</b> column draws a line at each marker. Long idle stretches are shortened to a hatched <b>⋯</b> break so activity gets the room, and choosing the <b>◎</b> target on a phase zooms the strip to it.</p>${art('strip', 'The activity strip with three coloured phase bands and flags')}<p>In the <b>Timeline</b>, each phase has a header with its time range, ownership mix and a summary. Click the header to fold the phase away.</p>${art('timeline', 'Timeline with a collapsible header per phase showing request counts, new endpoints, duplicates and failures')}`)}
    ${step(3, 'Zoom Into One Phase', `<p>Click the <b>◎</b> target on a header (or the one in the markers panel) and Foxy shows just that phase, in the Timeline <i>and</i> in Endpoints. A pill appears under the toolbar; click <b>×</b> to bring everything back.</p><p>The <b>Phase</b> column in Endpoints shows where each endpoint <i>first</i> appeared. Click a phase chip to filter by it.</p>`)}
    ${step(4, 'Tidy Up', '<p>Rename a marker by editing its name in the panel. Delete it with ✕ and the two phases around it merge. When a flow is over, press the stop button on its phase: anything after that moment is <i>Between phases</i> instead of counting toward it. Nothing in the app needs to change.</p>')}
    ${step(5, 'Take It With You', `<p>Every <b>download</b> icon opens one <b>Export</b> dialog: pick a format (JSON, CSV by request or by endpoint, a markdown table, or JSON for an agent), then tap the button at the bottom. Downloads close the dialog; a copy keeps it open. Every export says it is from Foxy and records the time, branch, commit and app build. <b>Export…</b> in the menu does the same for the whole capture. The last phase is still collecting, so it exports what has arrived so far.</p><p>Agents can drive Foxy too, which is handy for scripted runs: the MCP tools <code>marker_add</code>, <code>marker_list</code>, <code>marker_end</code>, <code>network_export_phase</code> and <code>network_export_capture</code> add and end markers and write exports to a file.</p>`)}
    <h3>What the Numbers in a Phase Mean</h3>
    <ul>
      <li><b>requests</b>: calls made while the phase was active.</li>
      <li><b>new endpoints</b>: URLs (method + host + path) seen for the first time in the whole capture. A high number early on tells you what the app needs to boot.</li>
      <li><b>identical dupes</b>: requests identical to one made <i>earlier</i>, even in a previous phase. These are the clearest candidates to cache or remove.</li>
      <li><b>${icon('quiet')} quiet</b>: nothing was requested. That is good news for a phase where you were just looking at a screen.</li>
    </ul>
    <h3>A Good First Run</h3>
    ${art('recipe', 'Step-by-step recipe for a fresh-install capture with the markers to drop at each moment')}
    <div class="callout tip"><p><b>Tip:</b> the 30 second idle gap is the most revealing part. Whatever fires there is not waiting on the user, so it is a prime candidate to defer.</p></div>
    ${markers.length ? `<div class="live"><b>Right now:</b> ${phases.map((p) => `<span class="chip" style="--c:${p.color};margin:2px 4px 2px 0"><span class="t">${esc(p.label)} · ${p.n} req</span></span>`).join('')}</div>` : ''}` },

  { id: 'timeline', em: '📜', title: 'Reading the Timeline', html: () => `
    <h2>Reading the Timeline</h2>
    <p class="lede">One row per request, newest first. Click a row for the full call chain and the request and response.</p>
    ${art('anatomy', 'How to read the call site cell and the owner chips')}
    <h3>Columns</h3>
    <ul>
      <li><b>Code Owners</b>: the CODEOWNERS team for the file that called <code>fetch</code>, plus a dashed chip for the team behind the <b>↳</b> caller when it is a different one. Third-party packages show their package name instead. Click any chip to filter by it.</li>
      <li><b>Started At</b> and <b>Time</b>: when the request started on the clock (hover for the date), and how far into the capture that was. <b>Duration</b> is how long it took.</li>
      <li><b>Call site</b>: the method that called <code>fetch</code>, and under it what called that method (<b>↳</b>), usually the hook or component, else the controller method. When the stack stops at the call site (it does after an <code>await</code>), the line under it is the file, line and column instead.</li>
      <li><b>Waterfall</b>: where the request sits on the capture and how long it took. Coloured lines are your markers.</li>
      <li><b>Launched from</b>: the screen the app was showing when the request was made, with the navigators above it. <b>on mount</b> means it fired as the screen appeared. Open a row for the screen's source file and the code that started the flow.</li>
    </ul>
    <div class="callout"><p>Click a column header to sort by it: once for one direction, again for the other, a third time to go back to the default order. The Timeline keeps its phases while sorted: <b>ID</b> and <b>Time</b> choose which end comes first, any other column orders the requests inside each phase. Drag a column header to reorder it, drag its right edge to resize it, double-click the edge to reset. <b>Reset Columns</b> in the menu restores the defaults.</p></div>
    <p>${goto('filters', '🎛️ Filters & duplicates')} ${goto('markers', '🚩 Markers & phases')}</p>` },

  { id: 'endpoints', em: '🧭', title: 'Endpoints & Verdicts', html: () => `
    <h2>Endpoints &amp; Verdicts</h2>
    <p class="lede">Requests grouped by <code>METHOD host/path</code>. This is the view that becomes your recommendation table. Press ${kb('2')} to open it from anywhere, and ${kb('1')} to go back to the Timeline.</p>
    ${art('rail', 'The call list of an endpoint: each call on a rail with its time, gap since the previous call, status and a repeat badge')}
    <h3>Open a Row</h3>
    <ul>
      <li><b>Cards</b>: calls, identical dupes with the time and bytes wasted, latency, the biggest burst within one second and the payload.</li>
      <li><b>Every call</b>: when it happened, the gap since the previous call (<b>⚡ same time</b> means a burst), and a badge when it repeats an earlier identical request. Click a call to open it in the Timeline.</li>
      <li><b>What changes between calls</b>: the query parameters that vary and the ones that never do.</li>
    </ul>
    <h3>Verdicts</h3>
    <p><b style="color:#b9f302">Keep</b> it is needed now · <b style="color:#f0b034">Defer</b> fetch it later (after unlock, on first use) · <b style="color:#8b99ff">Move</b> needed, but elsewhere in the flow · <b style="color:#ff7584">Drop</b> not needed. Add a reason. The <b>?</b> beside the Verdict title opens a quick legend of the four. Verdicts belong to a phase: focus one, then turn on <b>Audit</b> beside the phase pill to show the Verdict column and the Verdict panel. They are saved in this browser and included in the markdown and CSV exports.</p>` },

  { id: 'filters', em: '🎛️', title: 'Filters & Duplicates', html: () => `
    <h2>Filters &amp; Duplicates</h2>
    <p class="lede">Use the bar under the toolbar to narrow things down. Everything combines, and it all applies to the strip, Timeline and Endpoints.</p>
    <ul>
      <li><b>We Own</b>: the call site is code with a CODEOWNERS team. <b>Third-party</b>: it is inside a package such as Segment or Sentry. <b>Unowned</b>: neither.</li>
      <li><b>Failed</b>: errors, aborts and 4xx/5xx. <b>Duplicates</b>: identical requests made more than once. <b>Highlighted</b>: only the rows you highlighted (open a row and click the highlighter icon at the right of its request line, or press ${kb('H')}). Clear removes the highlights with the capture.</li>
      <li>Click a team or package chip anywhere to filter by it. Click a phase chip to filter by phase.</li>
      <li><b>Highlighted</b> is also a quick filter in the Filters panel.</li>
      <li>Type in the filter box (${kb('/')}) to match host, path, call site or team.</li>
      <li><b>Filters</b> (${kb('F')}) opens a panel to pick several teams, statuses, methods or hosts at once, flip any of them to <i>Is not</i>, and set a minimum duration. Every CODEOWNERS team is listed (with 0 until it makes a request), so you can star yours before capturing anything, then use <b>My teams</b> to see only your requests.</li>
    </ul>
    <h3>What Counts as Identical</h3>
    ${art('dupes', 'GETs are identical by URL; POSTs only when the body matches; POSTs without a captured body are never flagged')}
    <p>Turn on <code>FOXY_BODIES="true"</code> for the most accurate POST detection.</p>` },

  { id: 'menu', em: '☰', title: 'Menu & Storage', html: () => `
    <h2>Menu &amp; Storage</h2>
    <p class="lede">The menu button at the top right holds everything that is not about one request.</p>
    <ul>
      <li><b>Time Format</b> and <b>Theme</b>: how times read, and Dark, Light, Navy or Orange. Both are remembered.</li>
      <li><b>Reset Columns</b>: back to the default column order and widths.</li>
      <li><b>Export…</b>: JSON, CSV, or a markdown table you can copy or save as a <code>.md</code> file, for the capture or one phase.</li>
      <li><b>Clear Highlights</b>: removes the highlight from every request. It is greyed out while nothing is highlighted.</li>
      <li><b>Log Storage</b>: how big the request log file is and where it lives. <b>Clear Log File</b> empties it. The requests on screen, your markers and your audit verdicts are not touched.</li>
      <li><b>MetaMask Mobile</b> (desktop app only): the folder Foxy is using, with <b>Switch Folder…</b>.</li>
      <li><b>Clear</b>: a fresh capture. Request numbers start again at 1, and markers and highlights go.</li>
    </ul>
    <h3>Why Two Menus in the Desktop App</h3>
    <p>The menu button holds everything about the capture and the view. It is the same in the app, a browser tab and <code>yarn foxy</code>. The macOS menu bar holds only what needs the operating system:</p>
    <ul>
      <li><b>File &gt; Switch MetaMask Mobile Folder…</b> (${kb('⌘')} ${kb('O')}) points Foxy at another checkout. <b>Recent Folders</b> remembers the last few. Foxy restarts to switch, and asks first if that would drop a capture. <b>Show Folder in Finder</b> and <b>Set Up App for Foxy…</b> are here too.</li>
      <li><b>Foxy &gt; Open Dashboard in Browser</b>, <b>Show Data Folder</b> (log, audit verdicts, CODEOWNERS cache) and <b>Copy MCP Config…</b> (gives an agent access to the capture).</li>
    </ul>` },

  { id: 'keys', em: '⌨️', title: 'Shortcuts', html: () => `
    <h2>Shortcuts</h2>
    <table class="keys">
      <tr><td>${kb('1')}</td><td>Switch to the Timeline</td></tr>
      <tr><td>${kb('2')}</td><td>Switch to Endpoints</td></tr>
      <tr><td>${kb('M')}</td><td>Open the markers panel (start a new phase)</td></tr>
      <tr><td>${kb('E')}</td><td>Stop the running phase; press again to resume it</td></tr>
      <tr><td>${kb('P')}</td><td>Pause or resume live updates</td></tr>
      <tr><td>${kb('H')}</td><td>Highlight the open request, or remove its highlight</td></tr>
      <tr><td>${kb('F')}</td><td>Open the filters panel</td></tr>
      <tr><td>${kb('/')}</td><td>Focus the filter box (${kb('Esc')} clears it)</td></tr>
      <tr><td>${kb('?')}</td><td>Open this guide</td></tr>
      <tr><td>${kb('Esc')}</td><td>Close the panel, menu or guide; with none open, fold the open row</td></tr>
      <tr><td>${kb('←')} ${kb('→')}</td><td>On a column edge: resize it</td></tr>
      <tr><td>${kb('Enter')}</td><td>On a call in Endpoints: open it in the Timeline</td></tr>
    </table>` },
];
const help = $('#help');
function openHelp(id) {
  if (id) helpTopic = id;
  setMark(false); setMenu(false);
  if (!help.open) help.showModal();
  renderHelp();
}
let helpTopic = 'start';
function renderHelp() {
  const t = HELP.find((x) => x.id === helpTopic) || HELP[0];
  $('#helpNav').innerHTML = HELP.map((x) => `<button type="button" data-topic="${x.id}" class="${x.id === t.id ? 'active' : ''}" ${x.id === t.id ? 'aria-current="true"' : ''}><span class="em" aria-hidden="true">${x.em}</span>${esc(x.title)}</button>`).join('');
  const body = $('#helpBody'); body.innerHTML = t.html(); body.scrollTop = 0;
  fitArt();
}
/** Shrinks each illustration's font just enough to fit the window, so nothing is clipped (it scrolls only at extreme widths). */
function fitArt() {
  if (!help.open) return;
  document.querySelectorAll('#helpBody pre.art').forEach((pre) => {
    pre.style.fontSize = '';
    const base = parseFloat(getComputedStyle(pre).fontSize), pad = 32;
    const avail = pre.clientWidth - pad; // width the text can use (padding excluded, border excluded)
    pre.style.width = 'max-content'; pre.style.maxWidth = 'none';
    const need = pre.scrollWidth - pad;
    pre.style.width = ''; pre.style.maxWidth = '';
    if (need > avail && avail > 0) pre.style.fontSize = Math.max(8, (base * avail * 0.985) / need).toFixed(2) + 'px';
  });
}
window.addEventListener('resize', fitArt);
help.addEventListener('click', (e) => {
  if (e.target === help) { help.close(); return; } // backdrop
  const b = e.target.closest('[data-topic]'); if (b) { helpTopic = b.dataset.topic; renderHelp(); $('#helpBody').focus({ preventScroll: true }); }
});
$('#helpClose').onclick = () => help.close();
$('#helpDone').onclick = () => help.close();
$('#helpHide').checked = localStorage.getItem('foxy.help.hide') === '1';
$('#helpHide').addEventListener('change', (e) => localStorage.setItem('foxy.help.hide', e.target.checked ? '1' : '0'));
$('#helpBtn').onclick = () => openHelp(mkpop.classList.contains('open') ? 'markers' : undefined);
