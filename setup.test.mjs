import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  setEnvFlag, nodeProblem, parseAdbDevices, findAdb, lanAddress, ensureCoreCodeowners,
  renderSkill, installSkill, probePort,
  addBridgeImport, removeBridgeImport, bridgeStatus, installBridge, uninstallBridge,
} from './setup.mjs';
import { execFileSync } from 'node:child_process';

test('setEnvFlag leaves an already enabled flag alone', () => {
  const text = 'export A="1"\nexport FOXY="true"\nexport B="2"\n';
  assert.deepEqual(setEnvFlag(text, 'FOXY', 'true'), { text, changed: false, how: 'unchanged' });
  assert.equal(setEnvFlag('export FOXY=true\n', 'FOXY', 'true').changed, false);
});

test('setEnvFlag switches a commented line on in place and keeps neighbours', () => {
  const text = '# export FOXY="true"\n# export FOXY_URL="ws://localhost:8098/app"\nexport KEEP="1"\n';
  const result = setEnvFlag(text, 'FOXY', 'true');
  assert.equal(result.how, 'uncommented');
  assert.equal(result.text, 'export FOXY="true"\n# export FOXY_URL="ws://localhost:8098/app"\nexport KEEP="1"\n');
});

test('setEnvFlag corrects a different value and keeps a trailing comment', () => {
  const result = setEnvFlag('export FOXY="false" # off\n', 'FOXY', 'true');
  assert.equal(result.how, 'updated');
  assert.equal(result.text, 'export FOXY="true" # off\n');
});

test('setEnvFlag does not mistake FOXY_URL or FOXY_BODIES for FOXY', () => {
  const text = 'export FOXY_URL="ws://x"\nexport FOXY_BODIES="true"\n';
  const result = setEnvFlag(text, 'FOXY', 'true');
  assert.equal(result.how, 'added');
  assert.ok(result.text.startsWith(text));
  assert.ok(result.text.trimEnd().endsWith('export FOXY="true"'));
  assert.ok(result.text.includes('FOXY_BODIES="true"'));
});

test('setEnvFlag appends to an empty or newline-less file, and keeps CRLF', () => {
  assert.equal(setEnvFlag('', 'FOXY', 'true').text.trimEnd().split('\n').pop(), 'export FOXY="true"');
  assert.ok(setEnvFlag('export A="1"', 'FOXY', 'true').text.includes('export A="1"\n'));
  const crlf = setEnvFlag('export A="1"\r\n', 'FOXY', 'true').text;
  assert.ok(crlf.includes('\r\n') && !/[^\r]\n/.test(crlf));
});

test('setEnvFlag is idempotent', () => {
  const once = setEnvFlag('export A="1"\n', 'FOXY', 'true').text;
  assert.equal(setEnvFlag(once, 'FOXY', 'true').changed, false);
});

test('nodeProblem only complains about a different major', () => {
  assert.equal(nodeProblem('v24.22.1', '^24.22.1'), null);
  assert.equal(nodeProblem('v24.3.0', '^24.22.1'), null);
  assert.match(nodeProblem('v20.11.0', '^24.22.1'), /expects \^24\.22\.1/);
  assert.equal(nodeProblem('v24.1.0', undefined), null);
});

test('parseAdbDevices keeps only ready devices', () => {
  const out = 'List of devices attached\nemulator-5554\tdevice\nR58M\toffline\nZX1\tunauthorized\n192.168.1.9:5555\tdevice\n\n';
  assert.deepEqual(parseAdbDevices(out), ['emulator-5554', '192.168.1.9:5555']);
  assert.deepEqual(parseAdbDevices('List of devices attached\n\n'), []);
});

test('findAdb prefers the SDK, then PATH, then nothing', () => {
  const exists = (p) => p === '/sdk/platform-tools/adb';
  assert.equal(findAdb({ env: { ANDROID_HOME: '/sdk' }, home: '/h', exists, onPath: () => false }), '/sdk/platform-tools/adb');
  assert.equal(findAdb({ env: {}, home: '/h', exists: () => false, onPath: () => true }), 'adb');
  assert.equal(findAdb({ env: {}, home: '/h', exists: () => false, onPath: () => false }), null);
});

test('lanAddress picks the first external IPv4', () => {
  assert.equal(lanAddress({
    lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    en0: [{ family: 'IPv6', internal: false, address: 'fe80::1' }, { family: 'IPv4', internal: false, address: '192.168.1.20' }],
  }), '192.168.1.20');
  assert.equal(lanAddress({ lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] }), null);
});

test('ensureCoreCodeowners: sibling, download, cache, and offline', async () => {
  const root = mkdtempSync(join(tmpdir(), 'foxy-core-'));
  const repo = join(root, 'app');
  mkdirSync(repo);
  const cacheDir = join(root, 'cache');
  const ok = async () => ({ ok: true, text: async () => '* @MetaMask/core-team\n' });
  const offline = async () => { throw new Error('offline'); };

  assert.equal((await ensureCoreCodeowners({ repo, cacheDir, fetchImpl: offline })).source, 'missing');
  assert.equal((await ensureCoreCodeowners({ repo, cacheDir, fetchImpl: offline, dryRun: true })).source, 'missing');
  assert.equal((await ensureCoreCodeowners({ repo, cacheDir, fetchImpl: ok })).source, 'downloaded');
  assert.equal(readFileSync(join(cacheDir, '.github', 'CODEOWNERS'), 'utf8'), '* @MetaMask/core-team\n');
  assert.equal((await ensureCoreCodeowners({ repo, cacheDir, fetchImpl: offline })).source, 'cache');

  // stale cache: a failed refresh still uses the old copy
  const file = join(cacheDir, '.github', 'CODEOWNERS');
  const old = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  utimesSync(file, old, old);
  assert.equal((await ensureCoreCodeowners({ repo, cacheDir, fetchImpl: offline })).source, 'cache');

  mkdirSync(join(root, 'core', '.github'), { recursive: true });
  writeFileSync(join(root, 'core', '.github', 'CODEOWNERS'), '');
  assert.equal((await ensureCoreCodeowners({ repo, cacheDir, fetchImpl: offline })).source, 'sibling');
});

test('renderSkill drops maturity and marks the file as generated', () => {
  const out = renderSkill('---\nname: foxy\ndescription: Hi\nmaturity: experimental\n---\n\n# Foxy\n');
  assert.ok(out.startsWith('---\nname: foxy\ndescription: Hi\n---\n<!-- Generated'));
  assert.ok(!out.includes('maturity'));
  assert.ok(out.endsWith('# Foxy\n'));
});

test('installSkill writes every target once and then reports them current', () => {
  const root = mkdtempSync(join(tmpdir(), 'foxy-skill-'));
  const source = join(root, 'skill.md');
  writeFileSync(source, '---\nname: foxy\ndescription: Hi\nmaturity: experimental\n---\n# Foxy\n');
  const dry = installSkill({ repo: root, source, dryRun: true });
  assert.equal(dry.written.length, 3);
  assert.equal(existsSync(join(root, '.claude')), false);

  const first = installSkill({ repo: root, source });
  assert.deepEqual(first.written, ['.claude/skills', '.agents/skills', '.cursor/skills']);
  for (const dir of first.written) assert.ok(readFileSync(join(root, dir, 'foxy', 'SKILL.md'), 'utf8').includes('name: foxy'));

  const second = installSkill({ repo: root, source });
  assert.deepEqual(second.written, []);
  assert.equal(second.current.length, 3);

  writeFileSync(source, '---\nname: foxy\ndescription: Changed\n---\n# Foxy\n');
  assert.equal(installSkill({ repo: root, source }).written.length, 3);
  assert.equal(installSkill({ repo: root, source: join(root, 'nope.md') }).missing, true);
});

test('the shipped skill has the frontmatter the installers need', () => {
  const text = readFileSync(new URL('./skill/skill.md', import.meta.url), 'utf8');
  const front = text.match(/^---\n([\s\S]*?)\n---\n/)[1];
  assert.match(front, /^name: foxy$/m);
  const description = front.match(/^description: (.*)$/m)[1];
  assert.ok(description.length > 40 && description.length <= 1536);
  assert.ok(renderSkill(text).includes('name: foxy'));
});

test('probePort tells a free port from one in use', async () => {
  const holder = createServer();
  await new Promise((resolve) => holder.listen(0, resolve));
  const { port } = holder.address();
  assert.equal(await probePort(port, async () => { throw new Error('not http'); }), 'busy');
  assert.equal(await probePort(port, async () => ({ json: async () => ({ sessions: [] }) })), 'foxy');
  await new Promise((resolve) => holder.close(resolve));
  assert.equal(await probePort(port), 'free');
});


// ---- the in-app bridge ----------------------------------------------------------------------------------------------------
const INDEX = [
  "import './shim.js';",
  "import './app/core/NitroFetchSetup';",
  "import './app/core/NitroWebSocketSetup';",
  '',
  "import 'react-native-gesture-handler';",
  '',
].join('\n');

test('addBridgeImport goes after the Nitro fetch setup, once', () => {
  const first = addBridgeImport(INDEX);
  assert.equal(first.how, 'added');
  const lines = first.text.split('\n');
  const at = lines.indexOf("import './app/dev-tools/Foxy/install';");
  assert.ok(at > lines.indexOf("import './app/core/NitroWebSocketSetup';"), 'after both Nitro setup imports');
  assert.ok(at < lines.indexOf("import 'react-native-gesture-handler';"), 'before everything that can make a request');
  assert.deepEqual(addBridgeImport(first.text), { text: first.text, changed: false, how: 'present' });
});

test('addBridgeImport falls back to shim.js, keeps CRLF, and says when it cannot place the line', () => {
  assert.match(addBridgeImport("import './shim.js';\nimport 'x';\n").text, /shim\.js';\n\n\/\/ Foxy.*\nimport '\.\/app\/dev-tools\/Foxy\/install';\nimport 'x'/);
  assert.ok(addBridgeImport(INDEX.replace(/\n/g, '\r\n')).text.split('\r\n').includes("import './app/dev-tools/Foxy/install';"));
  assert.equal(addBridgeImport("import 'x';\n").how, 'unplaceable');
});

test('removeBridgeImport restores index.js exactly, comment and spacing included', () => {
  assert.equal(removeBridgeImport(addBridgeImport(INDEX).text).text, INDEX);
  assert.equal(removeBridgeImport(INDEX).changed, false);
  // the two-line comment the old in-repo bridge used
  const old = INDEX.replace("import './app/core/NitroWebSocketSetup';\n", "import './app/core/NitroWebSocketSetup';\n\n// Dev-only Foxy (no-op unless FOXY=true). Must come after the\n// Nitro fetch setup and before anything that can make a request.\nimport './app/dev-tools/Foxy/install';\n");
  assert.equal(removeBridgeImport(old).text, INDEX);
});

/** A throwaway MetaMask-Mobile-shaped checkout in a real git repo. */
function fakeApp() {
  const repo = mkdtempSync(join(tmpdir(), 'foxy-app-'));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(repo, 'index.js'), INDEX);
  writeFileSync(join(repo, 'package.json'), '{"name":"metamask"}');
  git('add', '.'); git('commit', '-qm', 'init');
  return { repo, git };
}

test('installBridge puts the bridge in a clean checkout and leaves only index.js dirty', () => {
  const { repo, git } = fakeApp();
  assert.equal(bridgeStatus({ repo }).ready, false);
  const done = installBridge({ repo });
  assert.deepEqual(done.written.sort(), ['FoxyBridge.ts', 'FoxyView.ts', 'install.ts']);
  assert.equal(done.index, 'added');
  assert.equal(done.excluded, true);
  assert.ok(existsSync(join(repo, 'app/dev-tools/Foxy/FoxyBridge.ts')));
  assert.equal(git('status', '--porcelain').trim(), 'M index.js', 'new files stay out of git status');
  assert.equal(bridgeStatus({ repo }).ready, true);
  // idempotent, and no second exclude line
  const again = installBridge({ repo });
  assert.deepEqual([again.written, again.index, again.excluded], [[], 'present', false]);
  assert.equal(readFileSync(join(repo, '.git/info/exclude'), 'utf8').split('\n').filter((l) => l === '/app/dev-tools/Foxy/').length, 1);
});

test('installBridge brings a stale copy up to date, and dryRun changes nothing', () => {
  const { repo } = fakeApp();
  installBridge({ repo });
  const file = join(repo, 'app/dev-tools/Foxy/FoxyBridge.ts');
  writeFileSync(file, '// old');
  assert.equal(bridgeStatus({ repo }).files['FoxyBridge.ts'], 'stale');
  assert.deepEqual(installBridge({ repo, dryRun: true }).written, ['FoxyBridge.ts']);
  assert.equal(readFileSync(file, 'utf8'), '// old');
  assert.deepEqual(installBridge({ repo }).written, ['FoxyBridge.ts']);
  assert.equal(bridgeStatus({ repo }).ready, true);
});

test('uninstallBridge returns the checkout to how it was', () => {
  const { repo, git } = fakeApp();
  installBridge({ repo });
  const done = uninstallBridge({ repo });
  assert.equal(done.removedImport, true);
  assert.equal(done.removedFiles.length, 3);
  assert.equal(git('status', '--porcelain').trim(), '');
  assert.equal(existsSync(join(repo, 'app/dev-tools/Foxy')), false);
  assert.equal(readFileSync(join(repo, '.git/info/exclude'), 'utf8').includes('dev-tools/Foxy'), false);
});

test('a branch that tracks its own bridge is left alone', () => {
  const { repo, git } = fakeApp();
  mkdirSync(join(repo, 'app/dev-tools/Foxy'), { recursive: true });
  for (const name of ['FoxyBridge.ts', 'FoxyView.ts', 'install.ts']) writeFileSync(join(repo, 'app/dev-tools/Foxy', name), '// the branch\'s own');
  writeFileSync(join(repo, 'index.js'), addBridgeImport(INDEX).text);
  git('add', '.'); git('commit', '-qm', 'branch bridge');
  assert.equal(bridgeStatus({ repo }).ready, true);
  assert.deepEqual(installBridge({ repo }).written, []);
  assert.equal(readFileSync(join(repo, 'app/dev-tools/Foxy/FoxyBridge.ts'), 'utf8'), "// the branch's own");
  assert.equal(uninstallBridge({ repo }).keptTracked, true);
});

test('installBridge refuses a folder that is not an app checkout', () => {
  const repo = mkdtempSync(join(tmpdir(), 'foxy-empty-'));
  assert.equal(installBridge({ repo }).index, 'no-index');
  assert.equal(existsSync(join(repo, 'app')), false);
});

test('the shipped bridge has the three files setup installs', () => {
  for (const name of ['FoxyBridge.ts', 'FoxyView.ts', 'install.ts']) assert.ok(existsSync(new URL(`./bridge/${name}`, import.meta.url)), name);
  assert.match(readFileSync(new URL('./bridge/install.ts', import.meta.url), 'utf8'), /FOXY === 'true'/);
});
