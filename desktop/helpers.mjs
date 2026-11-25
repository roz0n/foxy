// Pure helpers for the desktop app, kept apart from main.mjs because that imports `electron` and cannot be loaded by tests.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A MetaMask Mobile checkout: a package.json named "metamask" with an app/ folder. Returns a sentence when the folder is not one, else null. */
export function appDirProblem(dir) {
  if (!dir || !existsSync(dir)) return 'That folder does not exist.';
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    if (pkg.name === 'metamask' && existsSync(join(dir, 'app'))) return null;
  } catch { /* falls through */ }
  return 'That does not look like a MetaMask Mobile checkout (no package.json named "metamask" with an app/ folder).';
}

/**
 * The MCP config an agent needs to talk to a Foxy install. The command is the Foxy binary itself, run as plain Node
 * (ELECTRON_RUN_AS_NODE=1) on mcp.mjs, so nothing else has to be installed.
 */
export function mcpConfig({ execPath, root, port }) {
  return { mcpServers: { foxy: { command: execPath, args: [join(root, 'mcp.mjs')], env: { ELECTRON_RUN_AS_NODE: '1', FOXY_PORT: String(port) } } } };
}
