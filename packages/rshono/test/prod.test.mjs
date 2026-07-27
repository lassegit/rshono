import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { Agent, request } from 'node:http';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { APP_ENV, buildExample, EXAMPLE_DIST, parseActionForm, startServer, stopServer } from './helpers.mjs';

const READY = /serving on http:\/\/localhost:(\d+)/;

function readClientChunks() {
  const staticDir = join(EXAMPLE_DIST, 'static', 'chunks');
  return readdirSync(staticDir).map((f) => readFileSync(join(staticDir, f), 'utf8'));
}

/**
 * POSTs on a throwaway connection and resolves with the status code. For requests the server is
 * expected to reject mid-upload, where a connection reset is the correct outcome but must not be
 * left behind in a shared keep-alive pool.
 */
function postWithoutKeepAlive(path, body) {
  return new Promise((resolve, reject) => {
    const req = request(
      `${base}${path}`,
      { method: 'POST', agent: new Agent({ keepAlive: false }), headers: { 'content-type': 'application/json' } },
      // Resolve on headers: the status is all we assert, and the connection may well be reset
      // before the body finishes streaming either way.
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    // Only reaches the caller if the request failed *before* any response — a write-side reset after
    // the 413 has landed is expected here, and the promise has already settled by then.
    req.on('error', reject);
    req.end(body);
  });
}

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
  assert.ok(html.includes(APP_ENV.PUBLIC_API_ENDPOINT), 'ctx.env did not expose the PUBLIC_ variable');
});

test('the ctx page prop is the request context, without importing getContext()', async () => {
  const res = await fetch(`${base}/`, { headers: { cookie: 'visitor=Ada%20Lovelace' } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /data-ctx="method">(?:<!--[^]*?-->)?GET</, 'ctx.method was not readable from the page prop');
  assert.match(html, /data-ctx="visitor">(?:<!--[^]*?-->)?Ada Lovelace</, 'ctx.cookies was not readable from the page prop');
});

test("a server component's props never reach the browser, so ctx cannot leak through them", async () => {
  // Production React serializes a server component's *output*, not its props — and `ctx` is
  // non-enumerable besides, which is what keeps React's dev-only debug serialization off it too
  // (see `pageProps` in entry.rsc.tsx). Either way the Hono Context must not be on the wire.
  const flight = await (await fetch(`${base}/`, { headers: { Accept: 'text/x-component', cookie: 'visitor=Ada' } })).text();
  assert.match(flight, /"data-ctx":"visitor","children":"Ada"/, 'the page should have rendered its ctx-derived markup');
  // As a JSON key — the page renders the literal word "ctx" as prose, which is not a leak.
  assert.doesNotMatch(flight, /"ctx":/, 'the ctx prop itself must never be serialized into the payload');
  assert.doesNotMatch(flight, /"props":/, 'production serializes a server component output, never its props');
  assert.doesNotMatch(flight, /newResponse|setRenderer/, 'a serialized Hono Context would carry its own method names');
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

test('ctx.var carries a variable set by src/server.ts middleware through to the page', async () => {
  // The sub-app is mounted ahead of the page routes, which is what makes this reachable at all; the
  // page types it by handing its Hono Env to PageProps (see components/dashboard.tsx).
  const html = await (await fetch(`${base}/dashboard`, { headers: { cookie: 'session=ada%40example.com' } })).text();
  const requestId = html.match(/data-ctx="request-id">(?:<!--[^]*?-->)?([0-9a-f-]{36})</)?.[1];
  assert.ok(requestId, `ctx.var.requestId did not reach the page: ${html.match(/data-ctx="request-id"[^<]*</) ?? '(marker absent)'}`);
});

test('notFound() in a server component renders the 404 page', async () => {
  const res = await fetch(`${base}/profile/9999`, { headers: { Accept: 'text/html' } });
  assert.equal(res.status, 404);
  assert.match(await res.text(), /404 — nothing here/);
});

test('useNavigation() gives a client island server-computed pathname/params/searchParams during SSR (no flicker)', async () => {
  const html = await (await fetch(`${base}/profile/1?tab=settings`)).text();
  assert.match(html, /data-nav="pathname">(?:<!--[^]*?-->)?\/profile\/1</, 'useNavigation().pathname was wrong at SSR time');
  assert.match(html, /data-nav="param-id">(?:<!--[^]*?-->)?1</, 'useNavigation().params.id was wrong at SSR time');
  assert.match(html, /data-nav="query-tab">(?:<!--[^]*?-->)?settings</, 'useNavigation().searchParams was wrong at SSR time');
  assert.match(html, /data-nav="pending">(?:<!--[^]*?-->)?no</, 'nothing is navigating during SSR, so pending must be false');
});

test('the navigation URL rides the flight payload so soft navigation stays in sync', async () => {
  const flight = await (await fetch(`${base}/profile/1?tab=settings`, { headers: { Accept: 'text/x-component' } })).text();
  assert.match(flight, /profile\/1\?tab=settings/, 'the flight payload should carry the URL for the client router');
});

test('the client router (useNavigation) is bundled for the browser', () => {
  const sources = readClientChunks();
  assert.ok(
    sources.some((s) => s.includes('useNavigation() must be called')),
    'the framework-owned router provider must reach the client bundle for hydration to resolve it',
  );
});

test('NavigationProgress renders on every page but starts hidden (no hydration flicker)', async () => {
  const html = await (await fetch(`${base}/`)).text();
  const bar = html.match(/<div data-rshono-progress="" [^>]*>/)?.[0];
  assert.ok(bar, 'the opt-in <NavigationProgress /> should render into the layout');
  assert.match(bar, /opacity:0/, 'the bar must be invisible at rest — nothing is navigating during SSR');
  assert.match(bar, /width:0%/, 'the bar must have no width until a navigation is pending');
});

test('data-native links opt out of RSC soft navigation (full browser load)', async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /href="\/" data-native/, 'the example demonstrates a data-native link');
  assert.ok(
    readClientChunks().some((s) => s.includes('data-native')),
    'the click interceptor must recognize data-native so it can skip interception',
  );
});

test('data-prefetch links warm the flight cache on hover/focus', async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /href="\/users" data-prefetch/, 'the example demonstrates a data-prefetch link');
  const sources = readClientChunks();
  assert.ok(
    sources.some((s) => s.includes('data-prefetch')),
    'the client must look for a[data-prefetch] links',
  );
  assert.ok(
    sources.some((s) => s.includes('pointerover')),
    'prefetch should be triggered on hover (pointerover) and focus',
  );
});

test('the client router takes over scroll restoration for back/forward', () => {
  assert.ok(
    readClientChunks().some((s) => s.includes('scrollRestoration')),
    'manual scrollRestoration is how the router restores position on pop navigations',
  );
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
  const res = await fetch(`${base}/api/boom`, { headers: { Accept: 'text/html' } });
  assert.equal(res.status, 500);
  const html = await res.text();
  assert.match(html, /Something went wrong/);
  assert.match(html, /Internal Server Error/, 'prod error page shows the generic message');
  assert.doesNotMatch(html, /Intentional endpoint failure/, 'real error detail must be redacted in prod');
});

test('flight (soft-navigation) errors render the error page as an RSC payload, not plain text', async () => {
  const res = await fetch(`${base}/api/boom`, { headers: { Accept: 'text/x-component' } });
  assert.equal(res.status, 500);
  assert.match(res.headers.get('content-type'), /text\/x-component/, 'the client must get flight it can swap in, not plain text');
  const payload = await res.text();
  assert.match(payload, /Something went wrong/, 'error page component rendered into the flight payload');
  assert.doesNotMatch(payload, /Intentional endpoint failure/, 'real error detail must be redacted in prod');
});

test('a render failure answers with a visible error document, not a blank page', async () => {
  // SSR fails before any of the shell is sent, so the app's `error` page can't be reached — this is
  // the framework's own last-resort 500. It used to put its message inside <noscript>, which meant a
  // normal browser showed nothing at all.
  const res = await fetch(`${base}/crash?render=1`);
  assert.equal(res.status, 500);
  const html = await res.text();
  assert.match(html, /500 — Internal Server Error/, 'the failure document must carry a visible message');
  assert.doesNotMatch(html, /<noscript>/, 'the message must be visible without disabling JavaScript');
  assert.doesNotMatch(
    html,
    /<script[^>]+src=/,
    'the failed render must not attach the client runtime: hydrating a payload from the same failed render would tear the document down and blank the message',
  );
  assert.doesNotMatch(html, /Intentional render failure/, 'prod must not leak the real error into the page');
});

test('the fatal-error overlay ships to the browser, without its dev-only detail', () => {
  const sources = readClientChunks();
  assert.ok(
    sources.some((s) => s.includes('data-rshono-fatal')),
    'the overlay must ship so an uncaught error shows something instead of a white screen',
  );
  assert.ok(
    sources.some((s) => s.includes('the client runtime failed to start')),
    'a bootstrap failure must be reported rather than becoming a silent unhandled rejection',
  );
  assert.ok(
    sources.every((s) => !s.includes('Component stack:')),
    'the dev-only stack rendering must be compiled out of the production bundle',
  );
});

test('<Boundary> renders its children on the happy path', async () => {
  const res = await fetch(`${base}/boundary`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /data-section="ok"/, 'the async section should resolve and render through the boundary');
});

test('<Boundary> contains a thrown error locally instead of failing the whole page', async () => {
  const res = await fetch(`${base}/boundary?fail=1`, { headers: { Accept: 'text/html' } });
  assert.equal(res.status, 200, 'the error is caught by the boundary, not escalated to a 500');
  const html = await res.text();
  assert.match(html, /This section failed to load/, 'the boundary error fallback is delivered to the client');
  assert.doesNotMatch(html, /Something went wrong/, 'the global error page must NOT be used — the failure stayed local');
});

test('a soft-navigation into a boundary error stays a 200 flight (no hard reload)', async () => {
  const res = await fetch(`${base}/boundary?fail=1`, { headers: { Accept: 'text/x-component' } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/x-component/, 'the client gets flight it can swap in, not a redirect/reload');
  assert.match(await res.text(), /This section failed to load/);
});

test('a prerendered static page is served with a public cache header', async () => {
  const res = await fetch(`${base}/docs/getting-started`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control') ?? '', /public/, 'a request-independent prerendered page should be publicly cacheable');
});

test('a prerendered page carries an ETag and answers a revalidation with 304', async () => {
  const first = await fetch(`${base}/docs/getting-started`);
  const etag = first.headers.get('etag');
  assert.ok(etag, 'a prerendered page has fixed bytes, so it can carry a validator');

  const revalidated = await fetch(`${base}/docs/getting-started`, { headers: { 'if-none-match': etag } });
  assert.equal(revalidated.status, 304, 'the client already holds this exact page');
  assert.equal(revalidated.headers.get('etag'), etag);
  assert.match(revalidated.headers.get('cache-control') ?? '', /public/, 'a 304 must repeat the freshness directives');
  assert.equal(await revalidated.text(), '', 'the whole point is not to resend the body');

  const changed = await fetch(`${base}/docs/getting-started`, { headers: { 'if-none-match': '"not-the-one"' } });
  assert.equal(changed.status, 200, 'a stale validator must get the current page');
});

test('dynamic pages are never stored by a shared cache, and vary on Accept', async () => {
  // Same URL, two representations: a shared cache keyed on the URL alone would otherwise be free to
  // hand an HTML document to a soft navigation asking for flight — or one user's page to another.
  for (const accept of ['text/html', 'text/x-component']) {
    const res = await fetch(`${base}/whoami`, { headers: { Accept: accept, cookie: 'visitor=someone' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'private, no-cache', `${accept}: a personalised page must not be publicly cacheable`);
    assert.match(res.headers.get('vary'), /\bAccept\b/, `${accept}: content negotiation must be declared`);
  }
});

test('a route that sets its own cache-control keeps it', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.headers.get('cache-control'), null, 'endpoint routes are raw Hono — the page default must not bleed into them');
});

test('compressible responses are gzipped, and say so in Vary', async () => {
  const res = await fetch(`${base}/users`, { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(res.headers.get('content-encoding'), 'gzip');
  assert.match(res.headers.get('vary'), /Accept-Encoding/);
  assert.match(await res.text(), /Ada Lovelace/, 'and it still decodes to the real page');

  const identity = await fetch(`${base}/users`, { headers: { 'accept-encoding': 'identity' } });
  assert.equal(identity.headers.get('content-encoding'), null, 'a client that asks for no encoding gets none');
});

test('a soft navigation to a static route is served from the prerender, not re-rendered', async () => {
  // Prerendering used to pay off only for cold loads and crawlers: a flight request skipped the
  // built file and re-rendered the page the build had already produced.
  const res = await fetch(`${base}/docs/getting-started`, { headers: { Accept: 'text/x-component' } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/x-component/);
  assert.match(res.headers.get('cache-control') ?? '', /public/, 'the payload is as request-independent as the document is');
  const etag = res.headers.get('etag');
  assert.ok(etag, 'served from disk, so it can carry a validator');
  assert.match(await res.text(), /Getting Started/);

  const revalidated = await fetch(`${base}/docs/getting-started`, {
    headers: { Accept: 'text/x-component', 'if-none-match': etag },
  });
  assert.equal(revalidated.status, 304);
});

test('the document and the flight payload are both written, with distinct validators', async () => {
  assert.match(readFileSync(join(EXAMPLE_DIST, 'ssg', 'docs', 'getting-started', 'index.rsc'), 'utf8'), /Getting Started/);

  const [html, flight] = await Promise.all([
    fetch(`${base}/docs/getting-started`),
    fetch(`${base}/docs/getting-started`, { headers: { Accept: 'text/x-component' } }),
  ]);
  assert.notEqual(html.headers.get('etag'), flight.headers.get('etag'), 'two representations must not share one validator');
});

test('prerendered pages build absolute URLs from siteUrl, not from the build machine', async () => {
  // A prerendered file is handed to everyone, so its absolute URLs are decided at build time.
  // Without siteUrl they would say http://localhost — in the canonical tag, in og:url, everywhere.
  const html = await (await fetch(`${base}/docs/getting-started`)).text();
  assert.match(html, /<link rel="canonical" href="https:\/\/rshono\.example\/docs\/getting-started"\/?>/);
  assert.doesNotMatch(html, /http:\/\/localhost/, 'the build-time origin must not survive into a shipped page');

  const flight = await (await fetch(`${base}/docs/getting-started`, { headers: { Accept: 'text/x-component' } })).text();
  assert.match(flight, /https:\/\/rshono\.example\/docs\/getting-started/, 'useNavigation() reads the URL from this payload');
  assert.doesNotMatch(flight, /http:\/\/localhost/);
});

test('a dynamic route still resolves its URL per request, siteUrl notwithstanding', async () => {
  const html = await (await fetch(`${base}/whoami`)).text();
  assert.doesNotMatch(html, /rshono\.example/, 'siteUrl is a build-time concern only');
  assert.match(html, /localhost/, 'a dynamic page reflects the request it actually received');
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
    assert.ok(html.includes(APP_ENV.PUBLIC_API_ENDPOINT), 'the PUBLIC_ variable should still be inlined');
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
    sources.every((s) => !s.includes(APP_ENV.DATABASE_URL)),
    'DATABASE_URL value leaked into a client asset',
  );
  assert.ok(
    sources.some((s) => s.includes(APP_ENV.PUBLIC_API_ENDPOINT)),
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

// CSRF allowlist, origin-check-off, body-size cap and CSP are configured via rshono.config.ts and
// baked into the build, so they're exercised against dedicated config builds in prod-config.test.mjs.

test('action POSTs with no Origin but a cross-site Sec-Fetch-Site are rejected (CSRF)', async () => {
  const form = new FormData();
  form.set('name', 'evil');
  form.set('email', 'evil@evil.example');
  const res = await fetch(`${base}/signup`, {
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site' },
    body: form,
  });
  assert.equal(res.status, 403);
});

test('X-Forwarded-Host cannot be used to defeat the CSRF origin check', async () => {
  // The forwarded host used to be one of the values Origin was compared against, so sending both
  // made a cross-site POST look same-origin. Without `trustProxy` the header is now ignored outright.
  const form = new FormData();
  form.set('name', 'evil');
  form.set('email', 'evil@evil.example');
  const res = await fetch(`${base}/signup`, {
    method: 'POST',
    headers: {
      Origin: 'https://evil.example',
      'x-forwarded-host': 'evil.example',
      'sec-fetch-site': 'cross-site',
    },
    body: form,
  });
  assert.equal(res.status, 403);
});

test('X-Forwarded-Host cannot poison the public request URL without trustProxy', async () => {
  const flight = await (
    await fetch(`${base}/whoami`, {
      headers: { Accept: 'text/x-component', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' },
    })
  ).text();
  assert.doesNotMatch(flight, /evil\.example/, 'a client-supplied forwarded host reached the URL the app builds');
  assert.match(flight, new RegExp(`localhost:${server.port}`), 'the real request host should be used instead');
});

test('a browser-asserted same-origin Sec-Fetch-Site is trusted without a host comparison', async () => {
  // Sec-Fetch-Site is set by the browser and unforgeable by page script, so it settles the question
  // on its own. That short-circuit is what stops the check 403ing legitimate actions behind a proxy
  // that rewrites Host — modelled here by an Origin that deliberately doesn't match.
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: {
      Origin: 'https://rewritten-by-proxy.example',
      'sec-fetch-site': 'same-origin',
      'x-rsc-action': 'not-a-real-action-id',
      'content-type': 'text/plain',
    },
    body: '[]',
  });
  assert.equal(res.status, 400, 'should clear the CSRF gate and fail on the unknown action id instead');
});

test('an unknown server-action id is a 400, not an unhandled 500', async () => {
  const logsBefore = server.getOutput().length;
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: base, 'x-rsc-action': 'not-a-real-action-id', 'content-type': 'text/plain' },
    body: '[]',
  });
  assert.equal(res.status, 400);
  assert.doesNotMatch(
    server.getOutput().slice(logsBefore),
    /TypeError/,
    'an unknown action id must be rejected as a bad request, not fault into a stack trace',
  );
});

test('__proto__ as an action id is rejected instead of resolving through the prototype', async () => {
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: base, 'x-rsc-action': '__proto__', 'content-type': 'text/plain' },
    body: '[]',
  });
  assert.equal(res.status, 400);
});

test('onServerError receives the errors the framework catches, tagged by source', async () => {
  const logsBefore = server.getOutput().length;

  // A thrown endpoint (reaches the top-level handler) and a thrown server component (fails the
  // render) take completely different paths out of the framework; both must be reported.
  await fetch(`${base}/api/boom`, { headers: { Accept: 'text/html' } });
  await fetch(`${base}/crash?render=1`);
  await new Promise((resolve) => setTimeout(resolve, 200)); // the child's stdout reaches us asynchronously

  const logged = server.getOutput().slice(logsBefore);
  assert.match(logged, /\[error-reporter\] request \/api\/boom: Intentional endpoint failure/, 'a thrown endpoint must be reported');
  assert.match(logged, /\[error-reporter\] (?:render|ssr) \/crash/, 'a failed render must be reported');
});

test('a handler registered with onServerError does not replace the server log', async () => {
  const logsBefore = server.getOutput().length;
  await fetch(`${base}/api/boom`, { headers: { Accept: 'text/html' } });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const logged = server.getOutput().slice(logsBefore);
  assert.match(logged, /\[rshono\] request error:/, 'stderr stays the fallback signal even with a reporter wired up');
});

test('baseline security headers are set on every response', async () => {
  for (const path of ['/', '/api/health', '/favicon.ico']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', `${path} is missing nosniff`);
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', `${path} is missing referrer-policy`);
    // CSP is opt-in, so without this there is no framing protection at all by default.
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN', `${path} is missing x-frame-options`);
  }
});

test('the body-size cap covers endpoint routes and the server sub-app, not just actions', async () => {
  // Deliberately not `fetch`: the cap is enforced before the body is read, so the server answers
  // while the 2MB upload is still in flight and resets the connection. That's correct — but it
  // would leave a poisoned socket in undici's shared keep-alive pool for a later test to trip over.
  const status = await postWithoutKeepAlive('/api/users', JSON.stringify({ name: 'x'.repeat(2 * 1024 * 1024), email: 'big@example.com' }));
  assert.equal(status, 413, 'a 2MB body to a sub-app route should be refused by the 1MiB default cap');
});

test('a thrown server action is logged server-side (the client payload is redacted, so logs are the only signal)', async () => {
  const id = findCreateUserActionId();
  const logsBefore = server.getOutput().length;
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: base, 'x-rsc-action': id, Accept: 'text/x-component', 'content-type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify([{ name: '', email: 'invalid' }]),
  });
  assert.equal(res.status, 500);
  await new Promise((resolve) => setTimeout(resolve, 200)); // the child's stderr reaches us asynchronously
  const logged = server.getOutput().slice(logsBefore);
  assert.match(logged, /server action error/, 'a thrown action must be logged');
  assert.match(logged, /A name and a valid email are required/, 'the real error message must reach the server log');
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

test('a no-JS (progressive-enhancement) action that throws renders the error page', async () => {
  const html = await (await fetch(`${base}/crash`)).text();
  const fields = parseActionForm(html);
  assert.ok(fields.meta && fields.key, 'crash form is missing $ACTION fields');

  const form = new FormData();
  form.set('$ACTION_REF_1', fields.ref ?? '');
  form.set('$ACTION_1:0', fields.meta);
  form.set('$ACTION_1:1', fields.bound ?? '[{}]');
  form.set('$ACTION_KEY', fields.key);

  const res = await fetch(`${base}/crash`, {
    method: 'POST',
    headers: { Accept: 'text/html', Origin: base },
    body: form,
    redirect: 'manual',
  });
  assert.equal(res.status, 500, 'a thrown PE action must not swallow into a blank/redirect response');
  const body = await res.text();
  assert.match(body, /Something went wrong/, 'the error page component must render for a thrown PE action');
  assert.match(body, /Internal Server Error/, 'prod error page shows the generic redacted message');
  assert.doesNotMatch(body, /Intentional server-action failure/, 'the real error detail must be redacted in prod');
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
