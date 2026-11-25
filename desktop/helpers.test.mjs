import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appDirProblem, mcpConfig } from './helpers.mjs';

const checkout = (pkg, withApp = true) => {
  const dir = mkdtempSync(join(tmpdir(), 'foxy-app-'));
  if (pkg) writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  if (withApp) mkdirSync(join(dir, 'app'));
  return dir;
};

test('appDirProblem accepts a MetaMask Mobile checkout', () => {
  assert.equal(appDirProblem(checkout({ name: 'metamask' })), null);
});

test('appDirProblem explains what is wrong with other folders', () => {
  assert.match(appDirProblem(''), /does not exist/);
  assert.match(appDirProblem(join(tmpdir(), 'foxy-nope-' + Date.now())), /does not exist/);
  assert.match(appDirProblem(checkout({ name: 'metamask-extension' })), /does not look like/);
  assert.match(appDirProblem(checkout({ name: 'metamask' }, false)), /does not look like/);
  assert.match(appDirProblem(checkout(null)), /does not look like/);
});

test('mcpConfig runs mcp.mjs through the Foxy binary as plain Node, on the right port', () => {
  const config = mcpConfig({ execPath: '/Applications/Foxy.app/Contents/MacOS/Foxy', root: '/Applications/Foxy.app/Contents/Resources/app', port: 8098 });
  assert.deepEqual(config, {
    mcpServers: {
      foxy: {
        command: '/Applications/Foxy.app/Contents/MacOS/Foxy',
        args: ['/Applications/Foxy.app/Contents/Resources/app/mcp.mjs'],
        env: { ELECTRON_RUN_AS_NODE: '1', FOXY_PORT: '8098' },
      },
    },
  });
});
