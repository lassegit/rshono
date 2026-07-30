// `rshono dev`, which is a front-end proxy in front of a worker process that owns the compilers. That
// indirection is what these test: everything has to arrive at the browser as if it were served
// directly, and dev is also where React's debug channel is live and can leak what prod never would.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { startTestbed, stopServer } from './helpers.mjs';

const { base, child, port } = await startTestbed('dev', { timeoutMs: 90_000 });
after(() => stopServer(child));

test('dev serves both representations of a page through the worker proxy', async () => {
  const document = await fetch(`${base}/`);
  assert.equal(document.status, 200);
  const html = await document.text();
  assert.match(html, /__FLIGHT_DATA/);
  assert.match(html, /\/_static\/chunks\/main\.js/, 'dev assets are unhashed, so a reload picks up a rebuild');

  const flight = await fetch(`${base}/users`, { headers: { Accept: 'text/x-component' } });
  assert.equal(flight.status, 200);
  assert.match(flight.headers.get('content-type'), /text\/x-component/);
});

test('dev resolves the browser-facing URL through the proxy, not the worker address', async () => {
  // `trustProxy` is off by default but forced on in dev, because the dev front-end proxies to a
  // worker on a random localhost port and X-Forwarded-Host is the only thing that knows the real
  // one. Without it every page would see the internal 127.0.0.1:<worker> address.
  const flight = await (await fetch(`${base}/whoami`, { headers: { Accept: 'text/x-component' } })).text();
  assert.match(flight, new RegExp(`http://localhost:${port}/whoami`), 'the page URL should be the address the browser used');
  assert.doesNotMatch(flight, /127\.0\.0\.1/, 'the internal worker address must not leak into the page URL');
});

test('dev does not serialize the ctx page prop into the flight payload', async () => {
  // Dev is the case that needs guarding: React's debug channel puts a server component's props on
  // the wire (that is what the `"props":` row below is), walking own *enumerable* properties. `ctx`
  // is defined non-enumerable precisely so it is skipped — an enumerable one would ship the whole
  // Hono Context, `c.env` bindings and all, to the browser and add >10 kB to every page.
  const flight = await (await fetch(`${base}/`, { headers: { Accept: 'text/x-component', cookie: 'visitor=Ada' } })).text();
  assert.match(flight, /"props":\{[^{}]*"url"/, 'dev really does serialize page props — this test is only meaningful while it does');
  // As a JSON key — the home page renders the literal word "ctx" as prose, which is not a leak.
  assert.doesNotMatch(flight, /"ctx":/, 'the ctx prop must stay out of the dev debug payload');
  assert.doesNotMatch(flight, /newResponse|setRenderer|HtmlEscapedCallbackPhase/, 'a serialized Hono Context would carry its own internals');
  assert.match(flight, /data-ctx/, 'the page should still have rendered its ctx-derived markup');
});

test('a cross-origin action is still rejected in dev (trustProxy does not weaken the CSRF check)', async () => {
  const res = await fetch(`${base}/signup`, {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    body: new FormData(),
  });
  assert.equal(res.status, 403);
});

test('a render failure shows the real error and stack in dev', async () => {
  const res = await fetch(`${base}/crash?render=1`);
  assert.equal(res.status, 500);
  const html = await res.text();
  // The dev-only copy, which appears nowhere else — asserting on the error message alone would also
  // match the flight payload, which carries it in dev whether or not the document rendered it.
  assert.match(html, /Server-side rendering failed before the page shell/, 'dev should explain what failed');
  assert.match(html, /<pre[^>]*>Error: Intentional render failure/, 'dev should render the real message and stack');
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
