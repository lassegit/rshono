/**
 * Production e2e: one real `rshono build` of examples/rs-basic, then
 * assertions against a running `rshono start` server — pages, flight
 * protocol, server actions (client + progressive enhancement), CSRF,
 * SSG, caching, secret stripping, and a second instance with CSP on.
 */
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

test('static route is prerendered at build time and served in prod', async () => {
  const file = join(EXAMPLE_DIST, 'ssg', 'docs', 'getting-started', 'index.html');
  assert.match(readFileSync(file, 'utf8'), /Getting Started/);
  const res = await fetch(`${base}/docs/getting-started`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /pre-rendered at build time/);
});

test('hashed static assets are served immutable', async () => {
  const html = await (await fetch(`${base}/`)).text();
  const src = html.match(/src="(\/_static\/chunks\/main\.[0-9a-f]+\.js)"/)[1];
  const res = await fetch(base + src);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
});

test('secrets never render into SSR HTML — even from client components', async () => {
  // The Counter ('use client') reads process.env.DATABASE_URL; during
  // SSR it runs on the server, where the env shadow must hide it.
  const html = await (await fetch(`${base}/`)).text();
  assert.doesNotMatch(html, /my private database url/);
  assert.match(html, /public dummy url/);
  const flight = await (await fetch(`${base}/`, { headers: { Accept: 'text/x-component' } })).text();
  assert.doesNotMatch(flight, /my private database url/);
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
    'db.server code leaked into a client asset',
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
  assert.match(await res.text(), /Welcome aboard, NoScript Nancy/);
});

/** The createUser reference id lives in the AddUserForm client chunk. */
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

    // Prerendered file can't carry the per-request nonce → SSR path.
    const ssg = await fetch(`http://localhost:${csp.port}/docs/getting-started`);
    assert.ok(ssg.headers.get('content-security-policy'), 'SSG route missing CSP header');
    assert.match(await ssg.text(), /nonce="/);
  } finally {
    await stopServer(csp.child);
  }
});
