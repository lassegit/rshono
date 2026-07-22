import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { buildExample, EXAMPLE_DIST, parseActionForm, startServer, stopServer } from './helpers.mjs';

const READY = /serving on http:\/\/localhost:(\d+)/;

let server;
let base;

before(async () => {
  buildExample();
  server = await startServer('start', { urlPattern: READY });
  base = `http://localhost:${server.port}`;
});

after(async () => {
  if (server) await stopServer(server.child);
});

test('home page renders a full SSR document with flight payload and hashed assets', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /rshono/);
  assert.match(html, /__FLIGHT_DATA/);
  assert.match(html, /\/_static\/chunks\/main\.[0-9a-f]+\.js/);
  assert.match(html, /<link rel="stylesheet" href="\/_static\/chunks\/[^"]+\.css"/);
});

test('async server component reads the database directly', async () => {
  const html = await (await fetch(`${base}/users`)).text();
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /ada@example\.com/);
});

test('typed params page renders', async () => {
  const html = await (await fetch(`${base}/profile/1`)).text();
  assert.match(html, /Ada Lovelace/);
});

test('soft-navigation requests get a flight payload', async () => {
  const res = await fetch(`${base}/users`, { headers: { Accept: 'text/x-component' } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/x-component/);
  assert.match(await res.text(), /Ada Lovelace/);
});

test('getContext() exposes url/pathname, headers, cookies and env in an async server component', async () => {
  const res = await fetch(`${base}/whoami`, {
    headers: { 'x-test': 'hello-ctx', cookie: 'visitor=ada-cookie' },
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /pathname:.*\/whoami/s, 'ctx.pathname was wrong');
  assert.match(html, /hello-ctx/, 'x-test header was not visible to the async server component');
  assert.match(html, /ada-cookie/, 'visitor cookie was not visible to the async server component');
  assert.match(html, /public dummy url/, 'ctx.env did not expose the PUBLIC_ variable');
});

test('redirect() in a server component issues an HTTP 3xx on hard navigation', async () => {
  const res = await fetch(`${base}/dashboard`, { redirect: 'manual' });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location') ?? '', /\/login$/);
});

test('redirect() rides out as a flight digest on soft navigation', async () => {
  const res = await fetch(`${base}/dashboard`, { headers: { Accept: 'text/x-component' } });
  const body = await res.text();
  assert.match(body, /RSHONO_REDIRECT/, 'flight payload should carry the redirect digest for the client');
});

test('a cookie-gated server component renders once the session cookie is present', async () => {
  const res = await fetch(`${base}/dashboard`, { headers: { cookie: 'session=ada%40example.com' } });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Signed in as/);
});

test('notFound() in a server component renders the 404 page', async () => {
  const res = await fetch(`${base}/profile/9999`, { headers: { Accept: 'text/html' } });
  assert.equal(res.status, 404);
  assert.match(await res.text(), /404 — nothing here/);
});

test('a server action can redirect (POST-redirect-GET) and set a cookie without JavaScript', async () => {
  const html = await (await fetch(`${base}/login`)).text();
  const fields = parseActionForm(html);
  assert.ok(fields.meta && fields.key, 'login form is missing $ACTION fields');

  const form = new FormData();
  form.set('$ACTION_REF_1', fields.ref ?? '');
  form.set('$ACTION_1:0', fields.meta);
  form.set('$ACTION_1:1', fields.bound ?? '[{}]');
  form.set('$ACTION_KEY', fields.key);
  form.set('email', 'ada@example.com');

  const res = await fetch(`${base}/login`, { method: 'POST', headers: { Origin: base }, body: form, redirect: 'manual' });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location') ?? '', /\/dashboard$/);
  assert.ok(
    res.headers.getSetCookie().some((c) => /session=/.test(c)),
    'the action set a session cookie that should survive the redirect',
  );
});

test('endpoint route and Hono sub-app respond with JSON', async () => {
  const health = await (await fetch(`${base}/api/quick-health`)).json();
  assert.equal(health.ok, true);
  const users = await (await fetch(`${base}/api/users`)).json();
  assert.ok(Array.isArray(users.users) && users.users.length >= 3);
});

test('notFound page from routes.ts renders as a real RSC page', async () => {
  const res = await fetch(`${base}/definitely-not-a-page`, { headers: { Accept: 'text/html' } });
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.match(html, /404 — nothing here/);
  assert.match(html, /__FLIGHT_DATA/, '404 page should hydrate like any page');
});

test('soft navigation to a dead link gets a 404 flight payload', async () => {
  const res = await fetch(`${base}/definitely-not-a-page`, { headers: { Accept: 'text/x-component' } });
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /text\/x-component/);
  assert.match(await res.text(), /nothing here/);
});

test('non-HTML clients get plain-text 404s', async () => {
  const res = await fetch(`${base}/api/definitely-not-an-endpoint`);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), 'Not Found');
});

test('error page from routes.ts renders with redacted error info in prod', async () => {
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Accept: 'text/html', Origin: base, 'x-rsc-action': 'deadbeef', 'content-type': 'text/plain' },
    body: '[]',
  });
  assert.equal(res.status, 500);
  const html = await res.text();
  assert.match(html, /Something went wrong/);
  assert.match(html, /Internal Server Error/, 'prod error page shows the generic message');
  assert.doesNotMatch(html, /Failed to find Server Action/, 'real error detail must be redacted in prod');
});

test('flight (soft-navigation) errors render the error page as an RSC payload, not plain text', async () => {
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Accept: 'text/x-component', Origin: base, 'x-rsc-action': 'deadbeef', 'content-type': 'text/plain' },
    body: '[]',
  });
  assert.equal(res.status, 500);
  assert.match(res.headers.get('content-type'), /text\/x-component/, 'the client must get flight it can swap in, not plain text');
  const payload = await res.text();
  assert.match(payload, /Something went wrong/, 'error page component rendered into the flight payload');
  assert.doesNotMatch(payload, /Failed to find Server Action/, 'real error detail must be redacted in prod');
});

test('static route is prerendered at build time and served in prod', async () => {
  const file = join(EXAMPLE_DIST, 'ssg', 'docs', 'getting-started', 'index.html');
  assert.match(readFileSync(file, 'utf8'), /Getting Started/);
  const res = await fetch(`${base}/docs/getting-started`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /pre-rendered at build time/);
});

test('conventional root files in public/ are served at the web root', async () => {
  const robots = await fetch(`${base}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get('content-type'), /text\/plain/);
  assert.match(await robots.text(), /User-agent: \*/);
  assert.equal(robots.headers.get('cache-control'), 'public, max-age=300', 'public files are short-lived, not immutable');

  const favicon = await fetch(`${base}/favicon.svg`);
  assert.equal(favicon.status, 200);
  assert.match(favicon.headers.get('content-type'), /image\/svg\+xml/);
});

test('public/ is copied into dist/public so the build is self-contained', () => {
  assert.match(readFileSync(join(EXAMPLE_DIST, 'public', 'robots.txt'), 'utf8'), /User-agent/);
});

test('the layout links a real favicon served from public/ (no data: URI workaround)', async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /<link rel="icon" href="\/favicon\.svg"/);
  assert.doesNotMatch(html, /href="data:image\/svg/, 'the demo should no longer paper over missing static serving');
});

test('unknown root paths fall through to a 404 — the public fallback never shadows routing', async () => {
  const res = await fetch(`${base}/does-not-exist.txt`);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), 'Not Found');
});

test('hashed static assets are served immutable', async () => {
  const html = await (await fetch(`${base}/`)).text();
  const src = html.match(/src="(\/_static\/chunks\/main\.[0-9a-f]+\.js)"/)[1];
  const res = await fetch(base + src);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
});

test('secrets never render into SSR HTML — even from a no-directive helper', async () => {
  const SECRET = 'runtime-db-secret-must-not-leak';
  const srv = await startServer('start', { env: { DATABASE_URL: SECRET }, urlPattern: READY });
  try {
    const at = `http://localhost:${srv.port}`;
    const html = await (await fetch(`${at}/`)).text();
    assert.match(html, /Using leak helper:\s*(?:<!--\s*-->)?\(no secret\)/, 'no-directive helper leaked a real secret into SSR HTML');
    assert.match(html, /public dummy url/);
    assert.ok(!html.includes(SECRET), 'DATABASE_URL value must not appear in SSR HTML');
    const flight = await (await fetch(`${at}/`, { headers: { Accept: 'text/x-component' } })).text();
    assert.ok(!flight.includes(SECRET), 'DATABASE_URL value must not appear in the flight payload');
  } finally {
    await stopServer(srv.child);
  }
});

test('secrets never reach the client bundle; PUBLIC_ vars are inlined', () => {
  const staticDir = join(EXAMPLE_DIST, 'static', 'chunks');
  const sources = readdirSync(staticDir).map((f) => readFileSync(join(staticDir, f), 'utf8'));
  assert.ok(
    sources.every((s) => !s.includes('my private database url')),
    'DATABASE_URL value leaked into a client asset',
  );
  assert.ok(
    sources.some((s) => s.includes('public dummy url')),
    'PUBLIC_API_ENDPOINT was not inlined',
  );
  assert.ok(
    sources.every((s) => !s.includes('listDocs')),
    'db module code leaked into a client asset',
  );
});

test('cross-origin action POSTs are rejected (CSRF)', async () => {
  const form = new FormData();
  form.set('name', 'evil');
  form.set('email', 'evil@evil.example');
  const pe = await fetch(`${base}/signup`, {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
    body: form,
  });
  assert.equal(pe.status, 403);

  const client = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
    body: '[]',
  });
  assert.equal(client.status, 403);
});

test('progressive-enhancement form action works without JavaScript', async () => {
  const html = await (await fetch(`${base}/signup`)).text();
  const fields = parseActionForm(html);
  assert.ok(fields.meta && fields.key, 'signup form is missing $ACTION fields');

  const form = new FormData();
  form.set('$ACTION_REF_1', fields.ref ?? '');
  form.set('$ACTION_1:0', fields.meta);
  form.set('$ACTION_1:1', fields.bound ?? '[{}]');
  form.set('$ACTION_KEY', fields.key);
  form.set('name', 'NoScript Nancy');
  form.set('email', 'nancy@example.com');

  const res = await fetch(`${base}/signup`, {
    method: 'POST',
    headers: { Origin: base },
    body: form,
  });
  assert.equal(res.status, 200);
  const cookies = res.headers.getSetCookie();
  assert.ok(
    cookies.some((c) => /welcomed=/.test(c)),
    'server action cookie (getContext + setCookie) did not reach the response',
  );
  assert.match(await res.text(), /Welcome aboard, NoScript Nancy/);
});

function findCreateUserActionId() {
  const staticDir = join(EXAMPLE_DIST, 'static', 'chunks');
  for (const file of readdirSync(staticDir)) {
    if (!file.endsWith('.js')) continue;
    const source = readFileSync(join(staticDir, file), 'utf8');
    if (!source.includes('Add user')) continue;
    const match = source.match(/createServerReference\)?\(\s*"([0-9a-f]{20,})"/);
    if (match) return match[1];
  }
  throw new Error('could not locate the createUser server-reference id');
}

test('client-initiated server action mutates and re-renders', async () => {
  const id = findCreateUserActionId();
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: {
      Origin: base,
      'x-rsc-action': id,
      Accept: 'text/x-component',
      'content-type': 'text/plain;charset=UTF-8',
    },
    body: JSON.stringify([{ name: 'Wire Wanda', email: 'wanda@example.com' }]),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/x-component/);
  const payload = await res.text();
  assert.match(payload, /"ok":true/);
  assert.match(payload, /Wire Wanda/);
});

test('thrown action errors are redacted in production payloads', async () => {
  const id = findCreateUserActionId();
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: base, 'x-rsc-action': id, Accept: 'text/x-component', 'content-type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify([{ name: '', email: 'invalid' }]),
  });
  assert.equal(res.status, 500);
  const payload = await res.text();
  assert.doesNotMatch(payload, /A name and a valid email are required/);
});

test('RSC_HONO_CSP=1 sends a nonce-based CSP and skips the SSG shortcut', async () => {
  const csp = await startServer('start', { env: { RSC_HONO_CSP: '1' }, urlPattern: READY });
  try {
    const res = await fetch(`http://localhost:${csp.port}/`);
    const header = res.headers.get('content-security-policy');
    assert.ok(header, 'missing content-security-policy header');
    const nonce = header.match(/'nonce-([^']+)'/)[1];
    assert.doesNotMatch(header, /unsafe-eval/, 'prod CSP must not allow eval');
    const html = await res.text();
    assert.ok(html.includes(`nonce="${nonce}"`), 'nonce not stamped on scripts');

    const ssg = await fetch(`http://localhost:${csp.port}/docs/getting-started`);
    assert.ok(ssg.headers.get('content-security-policy'), 'SSG route missing CSP header');
    assert.match(await ssg.text(), /nonce="/);
  } finally {
    await stopServer(csp.child);
  }
});
