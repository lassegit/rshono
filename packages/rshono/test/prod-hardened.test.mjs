import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildExampleWith, startServer, stopServer } from './helpers.mjs';

// CSP, the CSRF allowlist and the body-size cap now come from rshono.config.ts and are baked into
// the server bundle — there is no runtime env-var interface. This suite builds the example against
// a hardened fixture config and asserts all three from that single build. Its own file so the
// build stays isolated from the default build under `--test-concurrency=1`.

const READY = /serving on http:\/\/localhost:(\d+)/;
const CONFIG = join(fileURLToPath(import.meta.url), '..', 'fixtures', 'hardened.config.mjs');

let server;
let base;

before(async () => {
  buildExampleWith(CONFIG);
  server = await startServer('start', { urlPattern: READY });
  base = `http://localhost:${server.port}`;
});

after(async () => {
  if (server) await stopServer(server.child);
});

test('csp: true sends a nonce-based CSP and skips the SSG shortcut', async () => {
  const res = await fetch(`${base}/`);
  const header = res.headers.get('content-security-policy');
  assert.ok(header, 'missing content-security-policy header');
  const nonce = header.match(/'nonce-([^']+)'/)[1];
  assert.doesNotMatch(header, /unsafe-eval/, 'prod CSP must not allow eval');
  const html = await res.text();
  assert.ok(html.includes(`nonce="${nonce}"`), 'nonce not stamped on scripts');

  const ssg = await fetch(`${base}/docs/getting-started`);
  assert.ok(ssg.headers.get('content-security-policy'), 'SSG route missing CSP header');
  assert.match(await ssg.text(), /nonce="/);
});

test('the CSP closes the gaps default-src does not cover, and cspDirectives merge over it', async () => {
  const header = (await fetch(`${base}/`)).headers.get('content-security-policy');
  // None of these are covered by default-src, and each closes an injection route of its own.
  for (const directive of ['base-uri', 'object-src', 'form-action']) {
    assert.match(header, new RegExp(`(^|; )${directive} `), `CSP is missing ${directive}`);
  }
  assert.match(header, /img-src 'self' https:\/\/images\.example/, 'a cspDirectives entry should widen the built-in directive');
  assert.match(header, /frame-ancestors 'self'/, 'a cspDirectives entry should replace the built-in default');
  assert.match(header, /script-src [^;]*'nonce-/, 'the per-request nonce must survive directive overrides');
});

test('allowedOrigins lets a listed cross-origin action through, others still rejected', async () => {
  // An allowlisted cross-origin clears the CSRF gate (then 400 on the bogus action id — not 403).
  const allowed = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: 'https://admin.example', 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
    body: '[]',
  });
  assert.notEqual(allowed.status, 403, 'an allowlisted cross-origin action must not be rejected as CSRF');

  const denied = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
    body: '[]',
  });
  assert.equal(denied.status, 403, 'a cross-origin action not on the allowlist is still rejected');
});

test('a bare host:port allowedOrigins entry is honoured, and Origin host case is normalized', async () => {
  // 'alt.example:8443' parses as a *scheme* on its own, so it used to normalize to an empty string
  // and silently match nothing — leaving the entry inert and putting '' in the allowlist.
  const bare = await fetch(`${base}/users`, {
    method: 'POST',
    headers: {
      Origin: 'https://alt.example:8443',
      'sec-fetch-site': 'cross-site',
      'x-rsc-action': 'whatever',
      'content-type': 'text/plain',
    },
    body: '[]',
  });
  assert.notEqual(bare.status, 403, "a bare 'host:port' allowlist entry must match");

  const mixedCase = await fetch(`${base}/users`, {
    method: 'POST',
    headers: {
      Origin: 'HTTPS://ADMIN.EXAMPLE',
      'sec-fetch-site': 'cross-site',
      'x-rsc-action': 'whatever',
      'content-type': 'text/plain',
    },
    body: '[]',
  });
  assert.notEqual(mixedCase.status, 403, 'the Origin host comparison must be case-insensitive');
});

test('an empty-host Origin is never trusted', async () => {
  // `URL.parse('file://').host` is '', which used to be a real allowlist member whenever a bare-host
  // entry had been mis-normalized — making `Origin: file://` trusted.
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: 'file://', 'sec-fetch-site': 'cross-site', 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
    body: '[]',
  });
  assert.equal(res.status, 403);
});

test('renderTimeout covers the server action, not just the render', async () => {
  // The deadline used to start *after* the action had run, so an action that never settled held the
  // socket open indefinitely. /hang posts to an action that never resolves.
  const html = await (await fetch(`${base}/hang`)).text();
  // A form rendered straight from a server component carries one hidden `$ACTION_ID_<id>` field,
  // rather than the $ACTION_REF/$ACTION_KEY set that useActionState emits.
  const actionField = html.match(/name="(\$ACTION_ID_[0-9a-f]+)"/)?.[1];
  assert.ok(actionField, '/hang is missing its $ACTION_ID field');

  const form = new FormData();
  form.set(actionField, '');

  const startedAt = Date.now();
  const res = await fetch(`${base}/hang`, {
    method: 'POST',
    headers: { Accept: 'text/html', Origin: base },
    body: form,
    redirect: 'manual',
  });
  const elapsed = Date.now() - startedAt;
  assert.equal(res.status, 500, 'a hung action should be cut off by the deadline, not left pending');
  assert.ok(elapsed < 8000, `the deadline (1500ms) should have fired long before this — took ${elapsed}ms`);
  await res.text();
});

test('trustProxy: true honours X-Forwarded-* without dragging the internal port along', async () => {
  const flight = await (
    await fetch(`${base}/whoami`, {
      headers: { Accept: 'text/x-component', 'x-forwarded-host': 'proxied.example', 'x-forwarded-proto': 'https' },
    })
  ).text();
  assert.match(flight, /https:\/\/proxied\.example\/whoami/, 'trustProxy should rebuild the URL from the forwarded headers');
  assert.doesNotMatch(flight, /proxied\.example:\d/, "the internal port must not survive onto a forwarded host that carries none");
});

test('bodySizeLimit rejects an oversized action POST body with 413 (memory-exhaustion guard)', async () => {
  const oversized = JSON.stringify([{ blob: 'x'.repeat(4096) }]);

  // Content-Length present: rejected up front, before the body is buffered.
  const declared = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: base, 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
    body: oversized,
  });
  assert.equal(declared.status, 413, 'a body over the cap with a Content-Length should be rejected with 413');

  // No Content-Length (chunked stream): the streaming byte-counter still trips the cap.
  const chunked = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: base, 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(oversized));
        controller.close();
      },
    }),
    duplex: 'half',
  });
  assert.equal(chunked.status, 413, 'a chunked body over the cap (no Content-Length) should still be rejected with 413');

  // A body under the cap is processed normally (here it fails to resolve the bogus action → 400, not 413).
  const under = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: base, 'x-rsc-action': 'whatever', Accept: 'text/html', 'content-type': 'text/plain' },
    body: '[]',
  });
  assert.notEqual(under.status, 413, 'a body under the cap must not be rejected as too large');
});
