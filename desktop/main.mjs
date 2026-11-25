// Foxy desktop: the same server and dashboard as `npm start`, in a window you can double-click.
//
// The server runs in this process (server.mjs is imported once the settings are known), so quitting the app stops it, and closing
// the window does not: on macOS the app keeps recording until you quit, and the Dock icon brings the window back.
//
// Foxy reads a MetaMask Mobile checkout (CODEOWNERS, screens, git remote). Pick it on first launch, or later from the Foxy menu.
//   FOXY_SMOKE=1  start the server, check it answers, print the result and exit (what CI runs)
import { app, BrowserWindow, Menu, dialog, shell, clipboard, ipcMain } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appDirProblem, mcpConfig } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); // where server.mjs, dashboard/ and mcp.mjs live
const DEFAULT_PORT = 8098;
const SMOKE = process.env.FOXY_SMOKE === '1';
const MAC = process.platform === 'darwin';
// macOS: no title bar; the dashboard header takes its place, with the traffic lights centered in it (the header is 55px tall).
// !important because the page's own header padding would otherwise win
const TRAFFIC_LIGHTS = { x: 18, y: 20 };
const TITLE_BAR_CSS = `
  header { padding-left: 88px !important; -webkit-app-region: drag; }
  header * { -webkit-app-region: no-drag; }
  header .brand, header .brand * { -webkit-app-region: drag; }
`;
const FULLSCREEN_CSS = 'header { padding-left: 16px !important; }';

app.setName('Foxy');
if (process.env.FOXY_DATA_DIR) app.setPath('userData', process.env.FOXY_DATA_DIR); // tests and CI keep their settings out of the real ones
const DATA = app.getPath('userData'); // ~/Library/Application Support/Foxy
const SETTINGS_FILE = join(DATA, 'settings.json');

/** @type {{ appDir?: string|null, port?: number, bounds?: object, asked?: boolean }} */
let settings = {};
try { settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')); } catch { settings = {}; }
const saveSettings = () => {
  try { mkdirSync(DATA, { recursive: true }); writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch (error) { console.warn(`[foxy] could not save settings: ${error.message}`); }
};

const port = Number(process.env.FOXY_PORT || settings.port || DEFAULT_PORT);
const dashboardUrl = () => `http://localhost:${port}/`;

/** @type {BrowserWindow | null} */
let win = null;
let startedServer = false;

async function chooseAppDir({ first = false } = {}) {
  if (first) {
    await dialog.showMessageBox({
      type: 'info',
      message: 'Welcome to Foxy',
      detail: 'Foxy reads your MetaMask Mobile checkout to find the team that owns each request and the screen it came from. Choose that folder next. You can switch folders any time from File > Switch MetaMask Mobile Folder (⌘O), or skip it and still see every request.',
      buttons: ['Choose Folder…'],
    });
  }
  for (;;) {
    const res = await dialog.showOpenDialog({
      title: 'Choose your MetaMask Mobile folder',
      message: 'The folder that contains package.json and app/',
      defaultPath: settings.appDir || join(homedir(), 'Developer'),
      properties: ['openDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const dir = res.filePaths[0];
    const problem = appDirProblem(dir);
    if (!problem) return dir;
    const again = await dialog.showMessageBox({ type: 'warning', message: problem, detail: dir, buttons: ['Choose Another…', 'Use It Anyway', 'Cancel'], defaultId: 0, cancelId: 2 });
    if (again.response === 1) return dir;
    if (again.response === 2) return null;
  }
}

async function changeAppDir() {
  const dir = await chooseAppDir();
  if (dir) { await offerSetup(dir); await useAppDir(dir); }
}

/** Points Foxy at another checkout. The server reads the folder once, when it starts, so Foxy restarts, and that clears the capture. */
async function useAppDir(dir) {
  if (dir === settings.appDir) return;
  if (!existsSync(dir)) {
    settings.recent = (settings.recent || []).filter((d) => d !== dir); saveSettings(); buildMenu();
    await dialog.showMessageBox({ type: 'warning', message: 'That folder is gone.', detail: dir });
    return;
  }
  if (!startedServer) {
    await dialog.showMessageBox({
      type: 'warning',
      message: 'Another Foxy is serving this window',
      detail: `Foxy found a server already running on port ${port} (for example \`npm start\` in a terminal) and is showing that one, so it cannot switch folders. Stop that server and open Foxy again; it will use:\n\n${dir}`,
    });
    remember(dir);
    return;
  }
  const requests = await fetch(`http://127.0.0.1:${port}/api/status`).then((r) => r.json()).then((s) => s.requests).catch(() => 0);
  if (requests) {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      message: 'Switch folders and restart Foxy?',
      detail: `Foxy restarts to read ${dir}.\n\nThe current capture (${requests} request${requests === 1 ? '' : 's'}) and its markers are cleared. Export it first from the dashboard menu if you want to keep it.`,
      buttons: ['Switch and Restart', 'Cancel'], defaultId: 0, cancelId: 1,
    });
    if (response !== 0) return;
  }
  remember(dir);
  app.relaunch(); app.exit(0);
}

/** Saves the folder as the current one and puts it first in File > Recent Folders. */
function remember(dir) {
  settings.recent = [dir, ...(settings.recent || []).filter((d) => d !== dir && d !== settings.appDir), ...(settings.appDir && settings.appDir !== dir ? [settings.appDir] : [])].slice(0, 6);
  settings.appDir = dir; settings.asked = true; saveSettings(); buildMenu();
}

/**
 * Sets a MetaMask Mobile checkout up for Foxy: the bridge (app/dev-tools/Foxy plus one import in index.js) and FOXY="true" in
 * .js.env, creating that file from .js.env.example when needed. Idempotent; returns what it changed, or null when nothing was needed.
 */
function applySetup(dir) {
  const { setEnvFlag, installBridge } = setupModule;
  const bridge = installBridge({ repo: dir });
  const envFile = join(dir, '.js.env');
  const example = join(dir, '.js.env.example');
  const current = existsSync(envFile) ? readFileSync(envFile, 'utf8') : existsSync(example) ? readFileSync(example, 'utf8') : '';
  const env = setEnvFlag(current, 'FOXY', 'true');
  const envChanged = env.changed || !existsSync(envFile);
  if (envChanged) writeFileSync(envFile, env.text);
  const changes = [];
  if (bridge.written.length) changes.push(`Bridge installed in app/dev-tools/Foxy (${bridge.written.join(', ')})`);
  if (bridge.index === 'added') changes.push('One import added to index.js (a tracked edit: do not commit it)');
  if (envChanged) changes.push('FOXY="true" set in .js.env');
  return { changes, problem: bridge.missing ? 'The bridge is missing from this copy of Foxy. Reinstall Foxy.' : bridge.index === 'no-index' ? 'This folder has no index.js, so it does not look like a MetaMask Mobile checkout.' : bridge.index === 'unplaceable' ? `Could not find where to import the bridge in index.js. Add this line after the Nitro fetch setup import:\n${"import './app/dev-tools/Foxy/install';"}` : null };
}

let setupModule = null;
async function prepareApp({ asked = false, dir = settings.appDir } = {}) {
  if (!dir) { await dialog.showMessageBox({ type: 'info', message: 'Choose your MetaMask Mobile folder first.', detail: 'File > Switch MetaMask Mobile Folder… (⌘O)' }); return; }
  setupModule ??= await import('../setup.mjs');
  const { changes, problem } = applySetup(dir);
  if (problem) { await dialog.showMessageBox({ type: 'warning', message: 'Foxy could not set up this folder', detail: `${dir}\n\n${problem}` }); return; }
  if (!changes.length) {
    if (!asked) await dialog.showMessageBox({ type: 'info', message: 'The app is already set up.', detail: `${dir}\n\nThe bridge is current and .js.env has FOXY="true".` });
    return;
  }
  await dialog.showMessageBox({
    type: 'info',
    message: 'The app is set up for Foxy',
    detail: `${dir}\n\n${changes.map((c) => `• ${c}`).join('\n')}\n\nRestart Metro so the app picks it up: stop it, then run \`yarn watch:clean\` in the app folder. File > Remove Foxy from App… undoes it.`,
  });
}

/** After a folder is picked: if it is not set up yet, say what Foxy will change in it and ask first. */
async function offerSetup(dir) {
  setupModule ??= await import('../setup.mjs');
  const envFile = join(dir, '.js.env');
  const flagged = existsSync(envFile) && !setupModule.setEnvFlag(readFileSync(envFile, 'utf8'), 'FOXY', 'true').changed;
  if (flagged && setupModule.bridgeStatus({ repo: dir }).ready) return;
  const { response } = await dialog.showMessageBox({
    type: 'question',
    message: 'Set this folder up for Foxy?',
    detail: `${dir}\n\nFoxy needs a small bridge inside the app to see its requests. Setting up:\n\n• copies three files into app/dev-tools/Foxy (kept out of git status)\n• adds one import line to index.js (a tracked edit, do not commit it)\n• sets FOXY="true" in .js.env\n\nFile > Remove Foxy from App… undoes all of it.`,
    buttons: ['Set Up', 'Not Now'], defaultId: 0, cancelId: 1,
  });
  if (response === 0) await prepareApp({ asked: true, dir });
}

async function removeFromApp() {
  const dir = settings.appDir;
  if (!dir) return;
  setupModule ??= await import('../setup.mjs');
  const done = setupModule.uninstallBridge({ repo: dir });
  const lines = [
    done.removedImport ? '• Import removed from index.js' : '• index.js had no Foxy import',
    done.keptTracked ? '• app/dev-tools/Foxy is tracked by git on this branch, so its files were kept' : done.removedFiles.length ? '• app/dev-tools/Foxy removed' : '• app/dev-tools/Foxy was not there',
    '• FOXY="true" is still in .js.env; it does nothing without the bridge',
  ];
  await dialog.showMessageBox({ type: 'info', message: 'Foxy was removed from the app', detail: `${dir}\n\n${lines.join('\n')}\n\nRestart Metro to apply it.` });
}

async function copyMcpConfig() {
  const config = mcpConfig({ execPath: process.execPath, root: ROOT, port });
  clipboard.writeText(JSON.stringify(config, null, 2));
  const claude = `claude mcp add foxy -e ELECTRON_RUN_AS_NODE=1 -e FOXY_PORT=${port} -- "${config.mcpServers.foxy.command}" "${config.mcpServers.foxy.args[0]}"`;
  await dialog.showMessageBox({
    type: 'info',
    message: 'MCP config copied',
    detail: `Paste it into Cursor's mcp.json (or Claude Desktop's config), then restart the agent. For Claude Code, run:\n\n${claude}\n\nFoxy has to be running for the tools to answer.`,
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const current = settings.appDir;
  const recent = (settings.recent || []).filter((d) => d !== current);
  const file = [
    { label: current ? `MetaMask Mobile: ${basename(current)}` : 'No MetaMask Mobile folder', enabled: false, toolTip: current || '' },
    { label: 'Switch MetaMask Mobile Folder…', accelerator: 'CmdOrCtrl+O', click: () => void changeAppDir() },
    {
      label: 'Recent Folders',
      enabled: recent.length > 0,
      submenu: recent.length ? [
        ...recent.map((d) => ({ label: d.replace(homedir(), '~'), click: () => void useAppDir(d) })),
        { type: 'separator' },
        { label: 'Clear Menu', click: () => { settings.recent = []; saveSettings(); buildMenu(); } },
      ] : [{ label: 'None', enabled: false }],
    },
    { label: 'Show Folder in Finder', enabled: Boolean(current), click: () => void shell.openPath(current) },
    { type: 'separator' },
    { label: 'Set Up App for Foxy…', enabled: Boolean(current), click: () => void prepareApp() },
    { label: 'Remove Foxy from App…', enabled: Boolean(current), click: () => void removeFromApp() },
    ...(isMac ? [{ type: 'separator' }, { role: 'close' }] : []),
  ];
  const foxy = [
    { label: 'Open Dashboard in Browser', click: () => void shell.openExternal(dashboardUrl()) },
    { label: 'Copy MCP Config…', click: () => void copyMcpConfig() },
    { label: 'Show Data Folder', click: () => void shell.openPath(DATA) },
  ];
  const template = [
    ...(isMac ? [{
      label: 'Foxy',
      submenu: [{ role: 'about' }, { type: 'separator' }, ...foxy, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
    }] : [{ label: 'Foxy', submenu: [...foxy, { type: 'separator' }, { role: 'quit' }] }]),
    { label: 'File', submenu: file },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// What the dashboard may ask for through desktop/preload.cjs. Only our own window, and only pages served by Foxy itself, get an answer.
const fromDashboard = (event) => event.senderFrame?.url?.startsWith(dashboardUrl());
ipcMain.handle('foxy:folder', (event) => (fromDashboard(event) ? settings.appDir || '' : ''));
ipcMain.handle('foxy:switch-folder', (event) => { if (fromDashboard(event)) void changeAppDir(); });

function createWindow() {
  if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); return; }
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1480, height: b.height || 940, x: b.x, y: b.y, minWidth: 900, minHeight: 600,
    title: 'Foxy', backgroundColor: '#000000', show: false,
    ...(MAC ? { titleBarStyle: 'hidden', trafficLightPosition: TRAFFIC_LIGHTS } : {}),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, preload: join(ROOT, 'desktop', 'preload.cjs') },
  });
  win.once('ready-to-show', () => win?.show());
  if (MAC) {
    // the dashboard header is the title bar; in full screen the traffic lights are gone, so it gives their room back
    let fullCss = null;
    const setFull = async (full) => {
      if (!win || win.isDestroyed()) return;
      if (full && !fullCss) fullCss = await win.webContents.insertCSS(FULLSCREEN_CSS);
      else if (!full && fullCss) { await win.webContents.removeInsertedCSS(fullCss); fullCss = null; }
    };
    win.webContents.on('did-finish-load', () => { fullCss = null; void win.webContents.insertCSS(TITLE_BAR_CSS); void setFull(win.isFullScreen()); });
    win.on('enter-full-screen', () => void setFull(true));
    win.on('leave-full-screen', () => void setFull(false));
  }
  let timer = null;
  const remember = () => { clearTimeout(timer); timer = setTimeout(() => { if (win && !win.isDestroyed() && !win.isMinimized() && !win.isFullScreen()) { settings.bounds = win.getBounds(); saveSettings(); } }, 400); };
  win.on('resize', remember); win.on('move', remember);
  win.on('closed', () => { win = null; });
  // GitHub links and anything else outside the dashboard open in the real browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== new URL(dashboardUrl()).origin) { event.preventDefault(); if (/^https?:/.test(url)) void shell.openExternal(url); }
  });
  void win.loadURL(dashboardUrl());
}

/** Starts the server in this process, unless a Foxy is already answering on the port (then the window just attaches to it). */
async function ensureServer() {
  const noProject = join(DATA, 'no-project'); // an empty folder, so Foxy runs without owner chips or screen links
  mkdirSync(noProject, { recursive: true });
  process.env.FOXY_REPO = settings.appDir && existsSync(settings.appDir) ? settings.appDir : (process.env.FOXY_REPO || noProject);
  process.env.FOXY_CACHE_DIR = join(DATA, 'cache');
  process.env.FOXY_LOG_FILE = process.env.FOXY_LOG_FILE || join(DATA, 'logs', 'foxy.jsonl');
  process.env.FOXY_PORT = String(port);

  const { probePort, ensureCoreCodeowners, bridgeStatus, installBridge } = await import('../setup.mjs');
  // A checkout set up earlier keeps its bridge in step with this version of Foxy (only when it was set up before: never a first install).
  try {
    const bridge = bridgeStatus({ repo: process.env.FOXY_REPO });
    if (bridge.imported && !bridge.ready) installBridge({ repo: process.env.FOXY_REPO });
  } catch (error) { console.warn(`[foxy] could not refresh the bridge: ${error.message}`); }
  const state = await probePort(port);
  if (state === 'foxy') return 'attached';
  if (state === 'busy') {
    dialog.showErrorBox('Foxy cannot start', `Port ${port} is used by another program. Quit it, or start Foxy on another port (FOXY_PORT) and use the same port in the app's .js.env as FOXY_URL.`);
    return 'busy';
  }
  await ensureCoreCodeowners({ repo: process.env.FOXY_REPO, cacheDir: join(DATA, 'cache', 'core') }); // best effort, never throws
  const { server } = await import('../server.mjs');
  if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  startedServer = true;
  return 'started';
}

async function smoke() {
  const result = await ensureServer();
  const status = await (await fetch(`http://127.0.0.1:${port}/api/status`)).json();
  const page = await fetch(`http://127.0.0.1:${port}/`);
  const html = await page.text();
  const dashboard = await loadDashboard();
  buildMenu();
  const menu = Menu.getApplicationMenu()?.items.map((item) => item.label) ?? [];
  const ok = result !== 'busy' && page.ok && html.includes('<title>Foxy</title>') && 'requests' in status && dashboard.ready && !dashboard.errors.length && menu.includes('File');
  console.log(`${ok ? 'SMOKE_OK' : 'SMOKE_FAIL'} ${JSON.stringify({ result, requests: status.requests, repo: process.env.FOXY_REPO, version: status.build?.version ?? null, dashboard, menu })}`);
  app.exit(ok ? 0 : 1);
}

/** Opens the dashboard in a hidden window and reports script errors: its files share one scope, so a wrong load order only shows in a browser. */
async function loadDashboard() {
  const probe = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, preload: join(ROOT, 'desktop', 'preload.cjs') } });
  const errors = [];
  probe.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(`${event.message} (${event.sourceId.replace(/^https?:\/\/[^/]+/, '')}:${event.lineNumber})`); });
  await probe.loadURL(dashboardUrl());
  await new Promise((r) => setTimeout(r, 1500));
  const ready = await probe.webContents.executeJavaScript(
    "typeof render === 'function' && typeof connect === 'function' && typeof openHelp === 'function' && Boolean(document.querySelector('#tabTimeline.active')) && typeof window.foxyDesktop?.folder === 'function' && !document.querySelector('#deskSwitch').hidden",
  ).catch((error) => { errors.push(String(error)); return false; });
  probe.destroy();
  return { ready, errors };
}

process.on('uncaughtException', (error) => console.error('[foxy] uncaught:', error));
process.on('unhandledRejection', (error) => console.error('[foxy] unhandled:', error));

if (!app.requestSingleInstanceLock() && !SMOKE) {
  app.quit();
} else {
  app.on('second-instance', () => createWindow());
  app.on('activate', () => createWindow()); // the Dock icon, after the window was closed
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.whenReady().then(async () => {
    if (SMOKE) { await smoke(); return; }
    buildMenu();
    if (!settings.asked) {
      settings.asked = true;
      const dir = await chooseAppDir({ first: true });
      if (dir) { settings.appDir = dir; await offerSetup(dir); }
      saveSettings(); buildMenu();
    }
    if ((await ensureServer()) === 'busy') { app.quit(); return; }
    createWindow();
  });
}
