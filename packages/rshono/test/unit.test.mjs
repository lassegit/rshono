// Unit tests for the pure pieces — the parsers, path maths and header helpers the e2e suite only
// exercises indirectly through one happy path. They import the *built* package, so they double as a
// check that dist is importable from plain Node.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

import { scanPageFiles } from '../dist/builder/page-files.js';
import { appendVary, etagMatches } from '../dist/server/headers.js';
import { parseByteSize, resolveServerConfig } from '../dist/server/server-config.js';
import { prerenderStaticRoutes, readPrerendered, resolveSiteOrigin, ssgFilePath } from '../dist/server/ssg.js';
import { isControlDigest, parseRedirectDigest, RedirectSignal } from '../dist/runtime/control.js';

const tempDirs = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'rshono-unit-'));
  tempDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('parseByteSize', () => {
  test('accepts numbers, units and the disabling values', () => {
    assert.equal(parseByteSize(undefined), undefined, 'undefined means "use the default"');
    assert.equal(parseByteSize(false), 0);
    assert.equal(parseByteSize(0), 0);
    assert.equal(parseByteSize(4_000_000), 4_000_000);
    assert.equal(parseByteSize('1mb'), 1024 * 1024);
    assert.equal(parseByteSize('512kb'), 512 * 1024);
    assert.equal(parseByteSize('1.5mb'), Math.floor(1.5 * 1024 * 1024));
    assert.equal(parseByteSize(' 2 MB '), 2 * 1024 * 1024, 'whitespace and case are tolerated');
    assert.equal(parseByteSize('900'), 900, 'a bare number string is bytes');
  });

  test('throws on a malformed size rather than silently uncapping the server', () => {
    assert.throws(() => parseByteSize('1 terabyte'), /invalid bodySizeLimit/);
    assert.throws(() => parseByteSize('mb'), /invalid bodySizeLimit/);
  });
});

describe('resolveServerConfig', () => {
  test('applies the documented defaults', () => {
    const config = resolveServerConfig({}, { isDev: false });
    assert.equal(config.renderTimeoutMs, 10_000);
    assert.equal(config.maxBodyBytes, 1024 * 1024);
    assert.equal(config.checkOrigin, true, 'CSRF checking is on unless turned off');
    assert.equal(config.trustProxy, false, 'proxy headers are never trusted by default');
    assert.equal(config.cspEnabled, false);
    assert.equal(config.compress, true);
    assert.deepEqual(config.allowedOrigins, []);
  });

  test('forces trustProxy on in dev, where the framework owns the proxy', () => {
    assert.equal(resolveServerConfig({ trustProxy: false }, { isDev: true }).trustProxy, true);
  });

  test('normalizes allowedOrigins to bare hosts and rejects junk', () => {
    const { allowedOrigins } = resolveServerConfig(
      { allowedOrigins: ['https://Admin.Example.com', 'localhost:4000', '  ', 'http://a.test:8080/ignored/path'] },
      { isDev: false },
    );
    assert.deepEqual(allowedOrigins, ['admin.example.com', 'localhost:4000', 'a.test:8080']);
    assert.throws(() => resolveServerConfig({ allowedOrigins: ['://'] }, { isDev: false }), /invalid allowedOrigins entry/);
  });

  test('cspDirectives merge over the defaults, and an empty string drops a directive', () => {
    const { cspDirectives } = resolveServerConfig(
      { csp: true, cspDirectives: { 'img-src': "'self' https://cdn.test", 'frame-ancestors': '' } },
      { isDev: false },
    );
    assert.equal(cspDirectives['img-src'], "'self' https://cdn.test", 'overrides win');
    assert.equal(cspDirectives['default-src'], "'self'", 'untouched defaults survive');
    assert.equal('frame-ancestors' in cspDirectives, false, "'' removes a directive entirely");
  });

  test('compress can be turned off for a proxy that already does it', () => {
    assert.equal(resolveServerConfig({ compress: false }, { isDev: false }).compress, false);
  });
});

describe('appendVary', () => {
  test('adds to the list instead of replacing it', () => {
    const headers = new Headers();
    appendVary(headers, 'Accept');
    assert.equal(headers.get('vary'), 'Accept');
    appendVary(headers, 'Accept-Encoding');
    assert.equal(headers.get('vary'), 'Accept, Accept-Encoding', 'the earlier entry must survive');
  });

  test('is idempotent and case-insensitive, and leaves * alone', () => {
    const headers = new Headers({ vary: 'accept' });
    appendVary(headers, 'Accept');
    assert.equal(headers.get('vary'), 'accept');

    const wildcard = new Headers({ vary: '*' });
    appendVary(wildcard, 'Accept');
    assert.equal(wildcard.get('vary'), '*', '* already means "never reuse"');
  });
});

describe('etagMatches', () => {
  const etag = '"abc123"';
  test('matches exact, weak and listed validators', () => {
    assert.equal(etagMatches(etag, etag), true);
    assert.equal(etagMatches(`W/${etag}`, etag), true, 'the compressor weakens the tag it sent');
    assert.equal(etagMatches(`"other", ${etag}`, etag), true);
    assert.equal(etagMatches('*', etag), true);
  });

  test('does not match a different or absent validator', () => {
    assert.equal(etagMatches(undefined, etag), false);
    assert.equal(etagMatches('', etag), false);
    assert.equal(etagMatches('"nope"', etag), false);
  });
});

describe('ssgFilePath', () => {
  test('maps a concrete route path to its index.html', () => {
    assert.equal(ssgFilePath('/'), 'index.html');
    assert.equal(ssgFilePath('/docs'), join('docs', 'index.html'));
    assert.equal(ssgFilePath('/docs/getting-started/'), join('docs', 'getting-started', 'index.html'));
  });

  test('maps the flight variant alongside the document', () => {
    assert.equal(ssgFilePath('/', 'flight'), 'index.rsc');
    assert.equal(ssgFilePath('/docs', 'flight'), join('docs', 'index.rsc'));
  });

  test('refuses patterns that are not a single concrete path', () => {
    assert.equal(ssgFilePath('/docs/:slug'), null);
    assert.equal(ssgFilePath('/files/*'), null);
  });
});

describe('resolveSiteOrigin', () => {
  test('falls back to a localhost placeholder when unset', () => {
    assert.equal(resolveSiteOrigin(undefined), 'http://localhost');
    assert.equal(resolveSiteOrigin(''), 'http://localhost');
  });

  test('reduces a configured site URL to its origin', () => {
    assert.equal(resolveSiteOrigin('https://example.com'), 'https://example.com');
    assert.equal(resolveSiteOrigin('https://example.com/'), 'https://example.com');
    assert.equal(resolveSiteOrigin('http://localhost:4000'), 'http://localhost:4000');
  });

  test('rejects a base path rather than silently dropping it', () => {
    assert.throws(() => resolveSiteOrigin('https://example.com/docs'), /must be a bare origin/);
    assert.throws(() => resolveSiteOrigin('https://example.com/?a=1'), /must be a bare origin/);
  });

  test('rejects something that is not an http(s) origin', () => {
    for (const bad of ['example.com', 'ftp://example.com', 'not a url']) {
      assert.throws(() => resolveSiteOrigin(bad), /invalid siteUrl/, `${bad} should be rejected`);
    }
  });
});

describe('readPrerendered', () => {
  test('reads a page, derives a stable ETag, and serves the second hit from memory', async () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'index.html'), '<!DOCTYPE html><p>docs</p>');

    const first = await readPrerendered(dir, '/docs');
    assert.equal(first.body, '<!DOCTYPE html><p>docs</p>');
    assert.match(first.etag, /^W\/"[\w-]{22}"$/, 'weak, so it survives being gzipped on the way out');

    const second = await readPrerendered(dir, '/docs');
    assert.equal(second, first, 'a cache hit returns the very same object, not a re-read');

    // Content decides the ETag, so a different page must not collide with this one.
    writeFileSync(join(dir, 'other.html'), '<!DOCTYPE html><p>other</p>');
    mkdirSync(join(dir, 'other'), { recursive: true });
    writeFileSync(join(dir, 'other', 'index.html'), '<!DOCTYPE html><p>other</p>');
    const other = await readPrerendered(dir, '/other');
    assert.notEqual(other.etag, first.etag);
  });

  test('returns null for a missing page instead of throwing', async () => {
    assert.equal(await readPrerendered(tempDir(), '/nope'), null);
  });

  test('refuses to escape the ssg directory', async () => {
    const dir = tempDir();
    const secretDir = mkdtempSync(join(tmpdir(), 'rshono-secret-'));
    tempDirs.push(secretDir);
    writeFileSync(join(secretDir, 'index.html'), 'secret');

    for (const attempt of ['/../', '/..%2f', '/docs/../../etc', '/./../']) {
      const result = await readPrerendered(dir, attempt);
      assert.equal(result, null, `traversal attempt "${attempt}" must not resolve`);
    }
  });
});

describe('prerenderStaticRoutes', () => {
  // The app answers per `Accept`, exactly as the real one does — the point of prerendering both.
  const okResponse = (request) =>
    request.headers.get('Accept') === 'text/x-component'
      ? new Response('0:{"root":"flight"}', { status: 200, headers: { 'Content-Type': 'text/x-component' } })
      : new Response('<!DOCTYPE html><p>ok</p>', { status: 200, headers: { 'Content-Type': 'text/html' } });

  test('writes both representations per static route and per staticPaths entry', async () => {
    const ssgDir = tempDir();
    const requested = [];
    const result = await prerenderStaticRoutes({
      ssgDir,
      routes: [
        { path: '/about', render: 'static', component: async () => ({ default: () => null }) },
        {
          path: '/docs/:slug',
          render: 'static',
          component: async () => ({ default: () => null }),
          staticPaths: async () => [{ slug: 'a' }, { slug: 'b' }],
        },
        { path: '/live', component: async () => ({ default: () => null }) },
      ],
      fetch: (request) => {
        requested.push(`${request.headers.get('Accept')} ${new URL(request.url).pathname}`);
        return okResponse(request);
      },
    });

    assert.deepEqual(result.written, ['/about', '/docs/a', '/docs/b']);
    assert.deepEqual(
      requested,
      [
        'text/html /about',
        'text/x-component /about',
        'text/html /docs/a',
        'text/x-component /docs/a',
        'text/html /docs/b',
        'text/x-component /docs/b',
      ],
      'each path is rendered as a document and as a flight payload; a dynamic route is never prerendered',
    );
    assert.equal((await readPrerendered(ssgDir, '/docs/a')).body, '<!DOCTYPE html><p>ok</p>');
    assert.equal((await readPrerendered(ssgDir, '/docs/a', 'flight')).body, '0:{"root":"flight"}');
  });

  test('renders against siteUrl, so absolute URLs in the output are the deployed ones', async () => {
    const seen = [];
    await prerenderStaticRoutes({
      ssgDir: tempDir(),
      siteUrl: 'https://example.com',
      routes: [{ path: '/about', render: 'static', component: async () => ({ default: () => null }) }],
      fetch: (request) => {
        seen.push(request.url);
        return okResponse(request);
      },
    });
    assert.deepEqual(seen, ['https://example.com/about', 'https://example.com/about']);
  });

  test('keeps the document when the flight payload cannot be produced', async () => {
    const ssgDir = tempDir();
    const result = await prerenderStaticRoutes({
      ssgDir,
      routes: [{ path: '/about', render: 'static', component: async () => ({ default: () => null }) }],
      fetch: (request) =>
        request.headers.get('Accept') === 'text/x-component'
          ? new Response('nope', { status: 500 })
          : new Response('<!DOCTYPE html><p>ok</p>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    });

    assert.deepEqual(result.written, ['/about'], 'a missing flight payload must not lose the document');
    assert.ok(await readPrerendered(ssgDir, '/about'));
    assert.equal(await readPrerendered(ssgDir, '/about', 'flight'), null, 'serving falls back to rendering it per request');
  });

  test('skips a parameterised static route with no staticPaths rather than failing the build', async () => {
    const result = await prerenderStaticRoutes({
      ssgDir: tempDir(),
      routes: [{ path: '/docs/:slug', render: 'static', component: async () => ({ default: () => null }) }],
      fetch: okResponse,
    });
    assert.deepEqual(result.written, []);
    assert.deepEqual(result.skipped, ['/docs/:slug']);
  });

  test('skips a path that did not render 200 HTML at build time', async () => {
    const result = await prerenderStaticRoutes({
      ssgDir: tempDir(),
      routes: [{ path: '/boom', render: 'static', component: async () => ({ default: () => null }) }],
      fetch: () => new Response('nope', { status: 500 }),
    });
    assert.deepEqual(result.written, []);
    assert.deepEqual(result.skipped, ['/boom']);
  });

  test('rejects param shapes it cannot turn into a single file', async () => {
    const cases = [
      { path: '/files/*', staticPaths: async () => [{}], expected: /wildcard segments/ },
      { path: '/docs/:slug{[a-z]+}', staticPaths: async () => [{ slug: 'a' }], expected: /optional\/regex params/ },
      { path: '/docs/:slug', staticPaths: async () => [{ wrong: 'a' }], expected: /without "slug"/ },
    ];
    for (const { path, staticPaths, expected } of cases) {
      await assert.rejects(
        prerenderStaticRoutes({
          ssgDir: tempDir(),
          routes: [{ path, render: 'static', staticPaths, component: async () => ({ default: () => null }) }],
          fetch: okResponse,
        }),
        expected,
        `"${path}" should be rejected`,
      );
    }
  });

  test('percent-encodes a param value so it stays one path segment', async () => {
    const requested = [];
    await prerenderStaticRoutes({
      ssgDir: tempDir(),
      routes: [
        {
          path: '/docs/:slug',
          render: 'static',
          component: async () => ({ default: () => null }),
          staticPaths: async () => [{ slug: 'a b/c' }],
        },
      ],
      fetch: (request) => {
        requested.push(new URL(request.url).pathname);
        return okResponse(request);
      },
    });
    assert.deepEqual(requested, ['/docs/a%20b%2Fc', '/docs/a%20b%2Fc'], 'once per representation');
  });
});

describe('control signals', () => {
  test('a redirect round-trips through its digest', () => {
    const signal = new RedirectSignal('/dashboard?next=/a b', 303);
    assert.equal(isControlDigest(signal.digest), true);
    assert.deepEqual(parseRedirectDigest(signal.digest), { location: '/dashboard?next=/a b', status: 303 });
  });

  test('a notFound digest is a control signal but not a redirect', () => {
    assert.equal(isControlDigest('RSHONO_NOT_FOUND'), true);
    assert.equal(parseRedirectDigest('RSHONO_NOT_FOUND'), null);
  });

  test('an unrelated digest is left alone', () => {
    for (const digest of [undefined, null, 42, '', 'some-react-digest']) {
      assert.equal(isControlDigest(digest), false, `${String(digest)} must not read as a control signal`);
    }
  });
});

describe('scanPageFiles', () => {
  test('resolves inline component thunks, including @/ and index files', () => {
    const dir = tempDir();
    const srcDir = join(dir, 'src');
    mkdirSync(join(srcDir, 'components', 'nested'), { recursive: true });
    writeFileSync(join(srcDir, 'components', 'home.tsx'), 'export default () => null;');
    writeFileSync(join(srcDir, 'components', 'about.ts'), 'export default () => null;');
    writeFileSync(join(srcDir, 'components', 'nested', 'index.tsx'), 'export default () => null;');

    const routesFile = join(srcDir, 'routes.ts');
    writeFileSync(
      routesFile,
      `export const routes = [
         { path: '/', component: () => import('./components/home') },
         { path: '/about', component: async () => import("@/components/about") },
         { path: '/nested', component: () => import('./components/nested') },
         { path: '/missing', component: () => import('./components/gone') },
         { path: '/indirect', component: loadSomething },
       ];`,
    );

    const found = new Set();
    scanPageFiles(routesFile, srcDir, found);
    assert.deepEqual(
      [...found].sort(),
      [join(srcDir, 'components', 'about.ts'), join(srcDir, 'components', 'home.tsx'), join(srcDir, 'components', 'nested', 'index.tsx')].sort(),
      'unresolvable and non-inline thunks are simply not page files',
    );
  });

  test('clears previous results so a removed route stops being a page file', () => {
    const dir = tempDir();
    const srcDir = join(dir, 'src');
    mkdirSync(srcDir, { recursive: true });
    const routesFile = join(srcDir, 'routes.ts');
    writeFileSync(routesFile, `export const routes = [];`);

    const found = new Set(['stale-entry']);
    scanPageFiles(routesFile, srcDir, found);
    assert.deepEqual([...found], []);
  });

  test('an unreadable routes file leaves the set empty instead of throwing', () => {
    const found = new Set();
    scanPageFiles(join(tempDir(), 'does-not-exist.ts'), tempDir(), found);
    assert.deepEqual([...found], []);
  });
});
