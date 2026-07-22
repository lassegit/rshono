import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer, stopServer } from './helpers.mjs';

let server;
let base;

before(async () => {
  server = await startServer('dev', { urlPattern: /dev server: http:\/\/localhost:(\d+)/, timeoutMs: 90_000 });
  base = `http://localhost:${server.port}`;
});

after(async () => {
  if (server) await stopServer(server.child);
});

test('dev server renders pages through the worker proxy', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /__FLIGHT_DATA/);
  assert.match(html, /\/_static\/chunks\/main\.js/);
});

test('dev flight requests work through the proxy', async () => {
  const res = await fetch(`${base}/users`, { headers: { Accept: 'text/x-component' } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/x-component/);
});

test('public/ files are served at the web root in dev (through the worker proxy)', async () => {
  const res = await fetch(`${base}/robots.txt`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /User-agent: \*/);
  assert.equal(res.headers.get('cache-control'), 'no-cache', 'dev serves public assets without caching');
});

test('HMR SSE channel greets with the current build hash', async () => {
  const controller = new AbortController();
  const res = await fetch(`${base}/_rshono/hmr`, { signal: controller.signal });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.match(text, /"type":"hello"/);
  controller.abort();
});
