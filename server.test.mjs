import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const HERE = dirname(fileURLToPath(import.meta.url));
let PORT = 0; // a fresh one per server, so a test never talks to the one before it as it shuts down

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (path, init) => (await fetch(`http://localhost:${PORT}${path}`, init)).json();

async function startServer(metro) {
  PORT = 18000 + Math.floor(Math.random() * 1900);
  const dir = mkdtempSync(join(tmpdir(), 'foxy-server-'));
  const child = spawn(process.execPath, [join(HERE, 'server.mjs')], {
    env: { ...process.env, FOXY_PORT: String(PORT), FOXY_REPO: dir, FOXY_CACHE_DIR: join(dir, 'cache'), FOXY_LOG_FILE: join(dir, 'foxy.jsonl'), FOXY_AUDIT_FILE: join(dir, 'audit.json'), FOXY_METRO: metro || 'http://localhost:1' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await api('/api/status'); return child; } catch { await sleep(100); }
  }
  child.kill();
  throw new Error('server did not start');
}

/** One app runtime: a WebSocket to /app that says hello with its own session id, like FoxyBridge does. */
async function appRuntime(s) {
  const ws = new WebSocket(`ws://localhost:${PORT}/app`);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const send = (msg) => ws.send(JSON.stringify({ s, ...msg }));
  send({ type: 'hello', startedAt: Date.now(), platform: 'ios' });
  return {
    request: (id, url, initiator = []) => send({ type: 'request', id, ts: Date.now(), url, method: 'GET', transport: 'fetch', initiator }),
    close: () => ws.close(),
  };
}

test('an app relaunch continues the capture: markers stay and request numbers carry on', async (t) => {
  const server = await startServer();
  t.after(() => server.kill());

  const first = await appRuntime('run-1');
  first.request(1, 'https://example.com/a');
  first.request(2, 'https://example.com/b');
  await sleep(150);
  await api('/api/marker', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'Onboarding visible' }) });
  first.close();

  const second = await appRuntime('run-2'); // a Metro reload: new session id, numbering from 1 again
  second.request(1, 'https://example.com/c');
  await sleep(150);
  t.after(() => second.close());

  const { markers } = await api('/api/markers');
  assert.deepEqual(markers.map((m) => m.label), ['Onboarding visible']);
  const { requests } = await api('/api/requests');
  assert.deepEqual(requests.map((r) => [r.id, r.path]), [[1, '/a'], [2, '/b'], [3, '/c']]);
  const status = await api('/api/status');
  assert.equal(status.sessions.length, 1);
  assert.equal(status.sessions[0].relaunches, 1);
});

test('Clear after a relaunch starts the numbering again at 1', async (t) => {
  const server = await startServer();
  t.after(() => server.kill());

  const first = await appRuntime('run-a');
  first.request(1, 'https://example.com/a');
  await sleep(100);
  first.close();
  const second = await appRuntime('run-b');
  second.request(1, 'https://example.com/b');
  await sleep(100);
  await api('/api/clear', { method: 'POST' });
  second.request(2, 'https://example.com/c');
  await sleep(100);
  t.after(() => second.close());

  const { requests } = await api('/api/requests');
  assert.deepEqual(requests.map((r) => [r.id, r.path]), [[1, '/c']]);
});

test('log storage reports the request log, and emptying it leaves the capture alone', async (t) => {
  const server = await startServer();
  t.after(() => server.kill());

  const app = await appRuntime('run-s');
  app.request(1, 'https://example.com/a');
  t.after(() => app.close());
  await sleep(200);
  const before = await api('/api/storage');
  assert.match(before.logFile, /foxy\.jsonl$/);
  assert.ok(before.logBytes > 0, 'requests are logged');

  const after = await api('/api/storage/clear', { method: 'POST' });
  assert.equal(after.ok, true);
  assert.equal(after.logBytes, 0);
  const { requests } = await api('/api/requests');
  assert.equal(requests.length, 1, 'the capture on screen is untouched');
});

test('a request captured while Metro is down is symbolicated once Metro comes back', async (t) => {
  // A stand-in Metro: answers /status and /symbolicate on a fixed port, like the real packager.
  const metroPort = 18000 + Math.floor(Math.random() * 1900) + 2000;
  const fakeMetro = () => new Promise((resolve) => {
    const m = createServer((req, res) => {
      if (req.url === '/status') { res.end('packager-status:running'); return; }
      if (req.url === '/symbolicate') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const { stack } = JSON.parse(body);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ stack: stack.map((f) => ({ file: 'app/Thing.ts', lineNumber: 7, column: 2, methodName: 'thing' })) }));
        });
        return;
      }
      res.statusCode = 404; res.end();
    });
    m.listen(metroPort, '127.0.0.1', () => resolve(m));
  });
  const bundle = `http://127.0.0.1:${metroPort}/index.bundle?platform=ios`;

  let metro = await fakeMetro();
  const server = await startServer(`http://127.0.0.1:${metroPort}`);
  t.after(() => server.kill());
  const app = await appRuntime('run-metro');
  t.after(() => app.close());

  // Metro is up: the first request symbolicates straight away.
  app.request(1, 'https://example.com/up', [`at thing (${bundle}:100:5)`]);
  await sleep(400);
  assert.equal((await api('/api/requests')).requests.find((r) => r.id === 1).symbolicated, true);

  // Metro goes away; a request arrives in the meantime.
  await new Promise((r) => metro.close(r));
  app.request(2, 'https://example.com/down', [`at thing (${bundle}:200:5)`]);
  await sleep(400);
  assert.equal((await api('/api/requests')).requests.find((r) => r.id === 2).symbolicated, false);

  // Metro comes back: Foxy finds it on its own (it checks every few seconds) and fills the row in.
  metro = await fakeMetro();
  t.after(() => new Promise((r) => metro.close(r)));
  let done = false;
  for (let i = 0; i < 40 && !done; i++) {
    await sleep(250);
    done = (await api('/api/requests')).requests.find((r) => r.id === 2)?.symbolicated === true;
  }
  assert.equal(done, true, 'the missed request was symbolicated after Metro returned');
});
