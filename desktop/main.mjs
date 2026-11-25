// Foxy desktop: the same server and dashboard as `npm start`, in a window you can double-click.
//
// The server runs in this process (server.mjs is imported once the settings are known), so quitting the app stops it, and closing
// the window does not: on macOS the app keeps recording until you quit, and the Dock icon brings the window back.
//
// Foxy reads a MetaMask Mobile checkout (CODEOWNERS, screens, git remote). Pick it on first launch, or later from the Foxy menu.
//   FOXY_SMOKE=1  start the server, check it answers, print the result and exit (what CI runs)
import { app, BrowserWindow, Menu, dialog, shell, clipboard } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appDirProblem, mcpConfig } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); // where server.mjs, dashboard.html and mcp.mjs live
const DEFAULT_PORT = 8098;
const SMOKE = process.env.FOXY_SMOKE === '1';

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
      detail: 'Foxy reads your MetaMask Mobile checkout to find the team that owns each request and the screen it came from. Choose that folder next. You can change it later from the Foxy menu, or skip it and still see every request.',
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
  if (!dir) return;
  settings.appDir = dir; settings.asked = true; saveSettings();
  if (startedServer) { app.relaunch(); app.exit(0); } // the server reads it once, when it starts
}

/** Turns FOXY="true" on in the app's .js.env (the same step `setup.mjs` does), creating the file from .js.env.example when needed. */
async function prepareApp() {
  const dir = settings.appDir;
  if (!dir) { await dialog.showMessageBox({ type: 'info', message: 'Choose your MetaMask Mobile folder first.', detail: 'Foxy menu > Choose MetaMask Mobile Folder…' }); return; }
  const { setEnvFlag } = await import('../setup.mjs');
  const envFile = join(dir, '.js.env');
  const example = join(dir, '.js.env.example');
  const current = existsSync(envFile) ? readFileSync(envFile, 'utf8') : existsSync(example) ? readFileSync(example, 'utf8') : '';
  const result = setEnvFlag(current, 'FOXY', 'true');
  if (!result.changed && existsSync(envFile)) {
    await dialog.showMessageBox({ type: 'info', message: 'The app is already set up.', detail: `${envFile} has FOXY="true".` });
    return;
  }
  writeFileSync(envFile, result.text);
  await dialog.showMessageBox({
    type: 'info',
    message: 'FOXY="true" is now in .js.env',
    detail: `${envFile}\n\nRestart Metro so the app picks it up: stop it, then run \`yarn watch:clean\` in the app folder. The bridge also has to be in the checkout (app/dev-tools/Foxy), which it is on the Foxy branch.`,
  });
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
  const foxy = [
    { label: 'Choose MetaMask Mobile Folder…', click: () => void changeAppDir() },
    { label: 'Set Up App for Foxy…', click: () => void prepareApp() },
    { type: 'separator' },
    { label: 'Open Dashboard in Browser', click: () => void shell.openExternal(dashboardUrl()) },
    { label: 'Copy MCP Config…', click: () => void copyMcpConfig() },
    { label: 'Show Data Folder', click: () => void shell.openPath(DATA) },
  ];
  const template = [
    ...(isMac ? [{
      label: 'Foxy',
      submenu: [{ role: 'about' }, { type: 'separator' }, ...foxy, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
    }] : [{ label: 'Foxy', submenu: [...foxy, { type: 'separator' }, { role: 'quit' }] }]),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); return; }
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1480, height: b.height || 940, x: b.x, y: b.y, minWidth: 900, minHeight: 600,
    title: 'Foxy', backgroundColor: '#000000', show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => win?.show());
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

  const { probePort, ensureCoreCodeowners } = await import('../setup.mjs');
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
  const ok = result !== 'busy' && page.ok && html.includes('<title>Foxy</title>') && 'requests' in status;
  console.log(`${ok ? 'SMOKE_OK' : 'SMOKE_FAIL'} ${JSON.stringify({ result, requests: status.requests, repo: process.env.FOXY_REPO, version: status.build?.version ?? null })}`);
  app.exit(ok ? 0 : 1);
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
      if (dir) settings.appDir = dir;
      saveSettings();
    }
    if ((await ensureServer()) === 'busy') { app.quit(); return; }
    createWindow();
  });
}
