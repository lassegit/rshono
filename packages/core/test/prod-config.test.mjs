// What rshono.config.ts changes about a production build. There is no runtime env-var interface for
// any of it — CSP, the CSRF allowlist, the body cap and trustProxy are resolved
// at build time and baked into the server bundle — so each permutation means its own build. They run
// one after another in this one file so the builds never race over `dist/` (the suite as a whole is
// serialised by `--test-concurrency=1`; suites inside a file are serial too).
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { buildTestbed, FIXTURES_DIR, startTestbed, stopServer } from './helpers.mjs';

/** Builds the testbed against a fixture config and serves it for the enclosing suite. */
function serve(configFile) {
  const app = {};
  before(async () => {
    buildTestbed(join(FIXTURES_DIR, configFile));
    const server = await startTestbed('start');
    app.base = server.base;
    app.child = server.child;
  });
  after(() => app.child && stopServer(app.child));
  return app;
}

describe('a hardened config', () => {
  const app = serve('hardened.config.mjs');

  test('csp: true sends a nonce-based CSP and renders static documents per request', async () => {
    const res = await fetch(`${app.base}/`);
    const header = res.headers.get('content-security-policy');
    assert.ok(header, 'missing content-security-policy header');
    const nonce = header.match(/'nonce-([^']+)'/)[1];
    assert.doesNotMatch(header, /unsafe-eval/, 'prod CSP must not allow eval');
    assert.ok((await res.text()).includes(`nonce="${nonce}"`), 'nonce not stamped on scripts');

    const ssg = await fetch(`${app.base}/docs/getting-started`);
    assert.ok(ssg.headers.get('content-security-policy'), 'SSG route missing CSP header');
    assert.match(await ssg.text(), /nonce="/);
  });

  test('the CSP closes the gaps default-src does not cover, and cspDirectives merge over it', async () => {
    const header = (await fetch(`${app.base}/`)).headers.get('content-security-policy');
    // None of these are covered by default-src, and each closes an injection route of its own.
    for (const directive of ['base-uri', 'object-src', 'form-action']) {
      assert.match(header, new RegExp(`(^|; )${directive} `), `CSP is missing ${directive}`);
    }
    assert.match(header, /img-src 'self' https:\/\/images\.example/, 'a cspDirectives entry should widen the built-in directive');
    assert.match(header, /frame-ancestors 'self'/, 'a cspDirectives entry should replace the built-in default');
    assert.match(header, /script-src [^;]*'nonce-/, 'the per-request nonce must survive directive overrides');
  });

  test('csp: true still serves the prerendered flight payload — only the document needs a nonce', async () => {
    // A flight payload never carries a nonce (that only goes on the HTML bootstrap), so there is
    // nothing per-request about it and no reason for CSP to cost soft navigations their prerender.
    const res = await fetch(`${app.base}/docs/getting-started`, { headers: { Accept: 'text/x-component' } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') ?? '', /public/, 'still served from disk under CSP');
    assert.ok(res.headers.get('etag'));
    assert.doesNotMatch(await res.text(), /nonce/, 'and it carries no nonce to go stale');
  });

  test('allowedOrigins lets the listed origins through, in every form, and nothing else', async () => {
    // Clearing the CSRF gate means the request fails later on the bogus action id — a 400, not a 403.
    const post = (origin) =>
      fetch(`${app.base}/users`, {
        method: 'POST',
        headers: { Origin: origin, 'sec-fetch-site': 'cross-site', 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
        body: '[]',
      });

    const allowed = [
      ['https://admin.example', 'a listed origin'],
      // 'alt.example:8443' parses as a *scheme* on its own, so it used to normalize to an empty
      // string and silently match nothing — leaving the entry inert and putting '' in the allowlist.
      ['https://alt.example:8443', "a bare 'host:port' allowlist entry"],
      ['HTTPS://ADMIN.EXAMPLE', 'the Origin host comparison, which must be case-insensitive'],
    ];
    for (const [origin, why] of allowed) {
      const res = await post(origin);
      await res.text();
      assert.notEqual(res.status, 403, `${why} must not be rejected as CSRF`);
    }

    // `URL.parse('file://').host` is '', which used to be a real allowlist member whenever a
    // bare-host entry had been mis-normalized — making `Origin: file://` trusted.
    for (const origin of ['https://evil.example', 'file://']) {
      const res = await post(origin);
      await res.text();
      assert.equal(res.status, 403, `${origin} is not on the allowlist and must be rejected`);
    }
  });

  test('trustProxy: true honours X-Forwarded-* without dragging the internal port along', async () => {
    const flight = await (
      await fetch(`${app.base}/whoami`, {
        headers: { Accept: 'text/x-component', 'x-forwarded-host': 'proxied.example', 'x-forwarded-proto': 'https' },
      })
    ).text();
    assert.match(flight, /https:\/\/proxied\.example\/whoami/, 'trustProxy should rebuild the URL from the forwarded headers');
    assert.doesNotMatch(flight, /proxied\.example:\d/, 'the internal port must not survive onto a forwarded host that carries none');
  });

  test('bodySizeLimit rejects an oversized action POST with 413, declared length or not', async () => {
    const oversized = JSON.stringify([{ blob: 'x'.repeat(4096) }]);
    const post = (body, extra) =>
      fetch(`${app.base}/users`, {
        method: 'POST',
        headers: { Origin: app.base, 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
        body,
        ...extra,
      });

    // Content-Length present: rejected up front, before the body is buffered.
    assert.equal((await post(oversized)).status, 413, 'a body over the cap with a Content-Length should be rejected');

    // No Content-Length (chunked stream): the streaming byte-counter still trips the cap.
    const chunked = await post(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(oversized));
          controller.close();
        },
      }),
      { duplex: 'half' },
    );
    assert.equal(chunked.status, 413, 'a chunked body over the cap should be rejected too');

    // Under the cap it is processed normally — here failing to resolve the bogus action id (400).
    assert.notEqual((await post('[]')).status, 413, 'a body under the cap must not be rejected as too large');
  });
});

describe('checkOrigin: false', () => {
  const app = serve('no-check.config.mjs');

  test('disables the CSRF origin check, for a gateway that enforces it instead', async () => {
    const res = await fetch(`${app.base}/users`, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
        'x-rsc-action': 'whatever',
        'content-type': 'text/plain',
      },
      body: '[]',
    });
    await res.text();
    assert.notEqual(res.status, 403, 'with the origin check disabled, a cross-origin action must not be rejected');
  });
});

// Config is resolved before Rspack compiles anything, so a bad security setting fails the build in
// seconds rather than producing a bundle that quietly does nothing. Last, and needing no server: the
// build fails while resolving the config, so it never writes over the `dist/` above.
test('a malformed allowedOrigins entry fails the build instead of silently matching nothing', () => {
  assert.throws(
    () => buildTestbed(join(FIXTURES_DIR, 'bad-origin.config.mjs')),
    /invalid allowedOrigins entry/,
    'an unparseable origin must fail the build — an inert allowlist entry looks like a working one',
  );
});
