// The production build of the example, served by `rshono start` and driven over HTTP. Everything the
// framework does that a browser is not required to observe is asserted here; what only exists once
// the client runtime is running lives in test/browser, and anything that has to be switched on in
// rshono.config.ts (CSP, the CSRF allowlist, the body cap, trustProxy) in prod-config.test.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Agent, request } from 'node:http';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { actionFormData, APP_ENV, buildExample, clientChunks, EXAMPLE_DIST, startExample, stopServer } from './helpers.mjs';

buildExample();
const { base, child, getOutput } = await startExample('start');
after(() => stopServer(child));

/** The id React assigned the example's `createUser` action, as the browser would call it. */
function createUserActionId() {
  for (const source of clientChunks()) {
    if (!source.includes('Add user')) continue;
    const match = source.match(/createServerReference\)?\(\s*"([0-9a-f]{20,})"/);
    if (match) return match[1];
  }
  throw new Error('could not locate the createUser server-reference id');
}

/** An action-shaped multipart POST body, for requests that are meant to be rejected before it is read. */
function signupBody() {
  const form = new FormData();
  form.set('name', 'evil');
  form.set('email', 'evil@evil.example');
  return form;
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

test('async server components read the database directly, on a plain and a parameterised route', async () => {
  for (const path of ['/users', '/profile/1']) {
    assert.match(await (await fetch(`${base}${path}`)).text(), /Ada Lovelace/, `${path} did not render its data`);
  }
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
  assert.match(html, /pathname:.*\/whoami/s, 'ctx.url.pathname was wrong');
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

test('redirect() in a server component: an HTTP 3xx on hard navigation, a digest on soft', async () => {
  const hard = await fetch(`${base}/dashboard`, { redirect: 'manual' });
  assert.equal(hard.status, 303);
  assert.match(hard.headers.get('location') ?? '', /\/login$/);

  const soft = await fetch(`${base}/dashboard`, { headers: { Accept: 'text/x-component' } });
  assert.match(await soft.text(), /RSHONO_REDIRECT/, 'the client needs the digest to follow the redirect itself');
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

test('an unmatched path renders the notFound page from routes.ts, as a document and as flight', async () => {
  const document = await fetch(`${base}/definitely-not-a-page`, { headers: { Accept: 'text/html' } });
  assert.equal(document.status, 404);
  const html = await document.text();
  assert.match(html, /404 — nothing here/);
  assert.match(html, /__FLIGHT_DATA/, 'the 404 page should hydrate like any page');

  const flight = await fetch(`${base}/definitely-not-a-page`, { headers: { Accept: 'text/x-component' } });
  assert.equal(flight.status, 404);
  assert.match(flight.headers.get('content-type'), /text\/x-component/);
  assert.match(await flight.text(), /nothing here/, 'a soft navigation swaps the 404 page in instead of reloading');
});

test('non-HTML clients get plain-text 404s', async () => {
  const res = await fetch(`${base}/api/definitely-not-an-endpoint`);
  assert.equal(res.status, 404);
  assert.equal(await res.text(), 'Not Found');
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

test('NavigationProgress renders on every page but starts hidden (no hydration flicker)', async () => {
  const html = await (await fetch(`${base}/`)).text();
  const bar = html.match(/<div data-rshono-progress="" [^>]*>/)?.[0];
  assert.ok(bar, 'the opt-in <NavigationProgress /> should render into the layout');
  assert.match(bar, /opacity:0/, 'the bar must be invisible at rest — nothing is navigating during SSR');
  assert.match(bar, /width:0%/, 'the bar must have no width until a navigation is pending');
});

test('the client runtime ships whole, with its dev-only detail compiled out', () => {
  // What the runtime *does* — soft navigation, data-native/data-prefetch links, scroll restoration,
  // the fatal overlay — is covered in test/browser, where it actually runs. This is the build-level
  // claim underneath it: the pieces reached the bundle, and the dev-only branches did not.
  const sources = clientChunks();
  for (const marker of ['useNavigation() must be called', 'data-native', 'data-prefetch', 'scrollRestoration', 'data-rshono-fatal']) {
    assert.ok(
      sources.some((source) => source.includes(marker)),
      `the client bundle is missing "${marker}"`,
    );
  }
  assert.ok(
    sources.some((source) => source.includes('the client runtime failed to start')),
    'a bootstrap failure must be reported rather than becoming a silent unhandled rejection',
  );
  assert.ok(
    sources.every((source) => !source.includes('Component stack:')),
    'the dev-only stack rendering must be compiled out of the production bundle',
  );
});

test('a server action can redirect (POST-redirect-GET) and set a cookie without JavaScript', async () => {
  const html = await (await fetch(`${base}/login`)).text();
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { Origin: base },
    body: actionFormData(html, { email: 'ada@example.com' }),
    redirect: 'manual',
  });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location') ?? '', /\/dashboard$/);
  assert.ok(
    res.headers.getSetCookie().some((cookie) => /session=/.test(cookie)),
    'the action set a session cookie that should survive the redirect',
  );
});

test('progressive-enhancement form action works without JavaScript', async () => {
  const html = await (await fetch(`${base}/signup`)).text();
  const res = await fetch(`${base}/signup`, {
    method: 'POST',
    headers: { Origin: base },
    body: actionFormData(html, { name: 'NoScript Nancy', email: 'nancy@example.com' }),
  });
  assert.equal(res.status, 200);
  assert.ok(
    res.headers.getSetCookie().some((cookie) => /welcomed=/.test(cookie)),
    'server action cookie (getContext + setCookie) did not reach the response',
  );
  assert.match(await res.text(), /Welcome aboard, NoScript Nancy/);
});

test('client-initiated server action mutates and re-renders', async () => {
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: {
      Origin: base,
      'x-rsc-action': createUserActionId(),
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

test('endpoint route and Hono sub-app respond with JSON', async () => {
  const health = await (await fetch(`${base}/api/quick-health`)).json();
  assert.equal(health.ok, true);
  const users = await (await fetch(`${base}/api/users`)).json();
  assert.ok(Array.isArray(users.users) && users.users.length >= 3);
});

test('a thrown endpoint renders the error page from routes.ts, redacted, in both representations', async () => {
  for (const accept of ['text/html', 'text/x-component']) {
    const res = await fetch(`${base}/api/boom`, { headers: { Accept: accept } });
    assert.equal(res.status, 500);
    assert.match(res.headers.get('content-type'), new RegExp(accept), `${accept}: the client must get something it can swap in`);
    const body = await res.text();
    assert.match(body, /Something went wrong/, `${accept}: the error page component should render`);
    assert.match(body, /Internal Server Error/, `${accept}: the error page shows the generic message`);
    assert.doesNotMatch(body, /Intentional endpoint failure/, `${accept}: real error detail must be redacted in prod`);
  }
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

test('a no-JS (progressive-enhancement) action that throws renders the error page', async () => {
  const html = await (await fetch(`${base}/crash`)).text();
  const res = await fetch(`${base}/crash`, {
    method: 'POST',
    headers: { Accept: 'text/html', Origin: base },
    body: actionFormData(html),
    redirect: 'manual',
  });
  assert.equal(res.status, 500, 'a thrown PE action must not swallow into a blank/redirect response');
  const body = await res.text();
  assert.match(body, /Something went wrong/, 'the error page component must render for a thrown PE action');
  assert.match(body, /Internal Server Error/, 'prod error page shows the generic redacted message');
  assert.doesNotMatch(body, /Intentional server-action failure/, 'the real error detail must be redacted in prod');
});

test('a thrown server action is redacted in the payload, but logged in full server-side', async () => {
  const logsBefore = getOutput().length;
  const res = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { Origin: base, 'x-rsc-action': createUserActionId(), Accept: 'text/x-component', 'content-type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify([{ name: '', email: 'invalid' }]),
  });
  assert.equal(res.status, 500);
  assert.doesNotMatch(await res.text(), /A name and a valid email are required/, 'the client must not be told why');

  await new Promise((resolve) => setTimeout(resolve, 200)); // the child's stderr reaches us asynchronously
  const logged = getOutput().slice(logsBefore);
  assert.match(logged, /server action error/, 'a thrown action must be logged');
  assert.match(logged, /A name and a valid email are required/, 'the real error message must reach the server log — it is the only signal left');
});

test('onServerError sees the errors the framework catches, tagged by source, without replacing the log', async () => {
  const logsBefore = getOutput().length;

  // A thrown endpoint (reaches the top-level handler) and a thrown server component (fails the
  // render) take completely different paths out of the framework; both must be reported.
  await fetch(`${base}/api/boom`, { headers: { Accept: 'text/html' } });
  await fetch(`${base}/crash?render=1`);
  await new Promise((resolve) => setTimeout(resolve, 200)); // the child's stdout reaches us asynchronously

  const logged = getOutput().slice(logsBefore);
  assert.match(logged, /\[error-reporter\] request \/api\/boom: Intentional endpoint failure/, 'a thrown endpoint must be reported');
  assert.match(logged, /\[error-reporter\] (?:render|ssr) \/crash/, 'a failed render must be reported');
  assert.match(logged, /\[rshono\] request error:/, 'stderr stays the fallback signal even with a reporter wired up');
});

test('<Boundary> renders its children on the happy path', async () => {
  const res = await fetch(`${base}/boundary`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /data-section="ok"/, 'the async section should resolve and render through the boundary');
});

test('<Boundary> contains a thrown error locally instead of failing the whole page', async () => {
  const logsBefore = getOutput().length;
  for (const accept of ['text/html', 'text/x-component']) {
    const res = await fetch(`${base}/boundary?fail=1`, { headers: { Accept: accept } });
    assert.equal(res.status, 200, `${accept}: the error is caught by the boundary, not escalated to a 500`);
    assert.match(res.headers.get('content-type'), new RegExp(accept), `${accept}: the client gets a payload it can swap in, not a reload`);
    const body = await res.text();
    assert.match(body, /This section failed to load/, `${accept}: the boundary error fallback is delivered to the client`);
    assert.doesNotMatch(body, /Something went wrong/, 'the global error page must NOT be used — the failure stayed local');
  }

  // The server-side account of a contained failure: the real error, once, and nothing else. React
  // reads its own redacted copy of it back out of the flight payload during SSR and — unless the
  // framework installs an `onError` — logs that copy too, which reads like an unhandled crash on a
  // request that went fine, with none of the detail needed to act on it.
  await new Promise((resolve) => setTimeout(resolve, 200)); // the child's stderr reaches us asynchronously
  const logged = getOutput().slice(logsBefore);
  assert.match(logged, /\[rshono\] render error: Error: the section blew up on purpose/, 'a contained failure must still be reported, in full');
  assert.doesNotMatch(logged, /An error occurred in the Server Components render/, "React's redacted duplicate must not be logged as well");
});

test('the build writes both representations of a static route', () => {
  const dir = join(EXAMPLE_DIST, 'ssg', 'docs', 'getting-started');
  assert.match(readFileSync(join(dir, 'index.html'), 'utf8'), /pre-rendered at build time/);
  assert.match(readFileSync(join(dir, 'index.rsc'), 'utf8'), /Getting Started/);
});

test('a prerendered route is served from disk in both representations, publicly cacheable and revalidatable', async () => {
  // Prerendering used to pay off only for cold loads and crawlers: a flight request skipped the built
  // file and re-rendered the page the build had already produced.
  const etags = {};
  for (const accept of ['text/html', 'text/x-component']) {
    const res = await fetch(`${base}/docs/getting-started`, { headers: { Accept: accept } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), new RegExp(accept));
    assert.match(res.headers.get('cache-control') ?? '', /public/, `${accept}: a request-independent page should be publicly cacheable`);
    assert.match(await res.text(), /Getting Started/);
    etags[accept] = res.headers.get('etag');
    assert.ok(etags[accept], `${accept}: served from disk, so it can carry a validator`);

    const revalidated = await fetch(`${base}/docs/getting-started`, { headers: { Accept: accept, 'if-none-match': etags[accept] } });
    assert.equal(revalidated.status, 304, `${accept}: the client already holds this exact page`);
    assert.equal(await revalidated.text(), '', 'the whole point is not to resend the body');
    assert.match(revalidated.headers.get('cache-control') ?? '', /public/, 'a 304 must repeat the freshness directives');

    const stale = await fetch(`${base}/docs/getting-started`, { headers: { Accept: accept, 'if-none-match': '"not-the-one"' } });
    assert.equal(stale.status, 200, `${accept}: a stale validator must get the current page`);
    await stale.text();
  }
  assert.notEqual(etags['text/html'], etags['text/x-component'], 'two representations must not share one validator');
});

test('prerendered pages build absolute URLs from siteUrl; a dynamic page uses the request it got', async () => {
  // A prerendered file is handed to everyone, so its absolute URLs are decided at build time.
  // Without siteUrl they would say http://localhost — in the canonical tag, in og:url, everywhere.
  const html = await (await fetch(`${base}/docs/getting-started`)).text();
  assert.match(html, /<link rel="canonical" href="https:\/\/rshono\.example\/docs\/getting-started"\/?>/);
  assert.doesNotMatch(html, /http:\/\/localhost/, 'the build-time origin must not survive into a shipped page');

  const flight = await (await fetch(`${base}/docs/getting-started`, { headers: { Accept: 'text/x-component' } })).text();
  assert.match(flight, /https:\/\/rshono\.example\/docs\/getting-started/, 'useNavigation() reads the URL from this payload');
  assert.doesNotMatch(flight, /http:\/\/localhost/);

  const dynamic = await (await fetch(`${base}/whoami`)).text();
  assert.doesNotMatch(dynamic, /rshono\.example/, 'siteUrl is a build-time concern only');
  assert.match(dynamic, /localhost/, 'a dynamic page reflects the request it actually received');
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

test('conventional root files in public/ are served at the web root', async () => {
  assert.match(
    readFileSync(join(EXAMPLE_DIST, 'public', 'robots.txt'), 'utf8'),
    /User-agent/,
    'public/ is copied into dist, so the build is self-contained',
  );

  const robots = await fetch(`${base}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get('content-type'), /text\/plain/);
  assert.match(await robots.text(), /User-agent: \*/);
  assert.equal(robots.headers.get('cache-control'), 'public, max-age=300', 'public files are short-lived, not immutable');

  const favicon = await fetch(`${base}/favicon.svg`);
  assert.equal(favicon.status, 200);
  assert.match(favicon.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await (await fetch(`${base}/`)).text(), /<link rel="icon" href="\/favicon\.svg"/, 'and the layout links one');
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

test('baseline security headers are set on every response', async () => {
  for (const path of ['/', '/api/health', '/favicon.ico']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', `${path} is missing nosniff`);
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', `${path} is missing referrer-policy`);
    // CSP is opt-in, so without this there is no framing protection at all by default.
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN', `${path} is missing x-frame-options`);
  }
});

test('secrets never reach the browser — not in the HTML, the flight payload, or a client chunk', async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /Using leak helper:\s*(?:<!--\s*-->)?\(no secret\)/, 'no-directive helper leaked a real secret into SSR HTML');
  assert.ok(!html.includes(APP_ENV.DATABASE_URL), 'DATABASE_URL value must not appear in SSR HTML');
  assert.ok(html.includes(APP_ENV.PUBLIC_API_ENDPOINT), 'the PUBLIC_ variable should be inlined');

  const flight = await (await fetch(`${base}/`, { headers: { Accept: 'text/x-component' } })).text();
  assert.ok(!flight.includes(APP_ENV.DATABASE_URL), 'DATABASE_URL value must not appear in the flight payload');

  const sources = clientChunks();
  assert.ok(
    sources.every((source) => !source.includes(APP_ENV.DATABASE_URL)),
    'DATABASE_URL value leaked into a client asset',
  );
  assert.ok(
    sources.every((source) => !source.includes('listDocs')),
    'db module code leaked into a client asset',
  );
  assert.ok(
    sources.some((source) => source.includes(APP_ENV.PUBLIC_API_ENDPOINT)),
    'PUBLIC_API_ENDPOINT was not inlined',
  );
});

test('an action POST that cannot be shown to be same-origin is rejected (CSRF)', async () => {
  const cases = [
    { name: 'a form POST from another origin', path: '/signup', headers: { Origin: 'https://evil.example' }, body: signupBody() },
    {
      name: 'a client action call from another origin',
      path: '/users',
      headers: { Origin: 'https://evil.example', 'x-rsc-action': 'whatever', 'content-type': 'text/plain' },
      body: '[]',
    },
    { name: 'no Origin at all, but a cross-site Sec-Fetch-Site', path: '/signup', headers: { 'sec-fetch-site': 'cross-site' }, body: signupBody() },
    {
      // The forwarded host used to be one of the values Origin was compared against, so sending both
      // made a cross-site POST look same-origin. Without `trustProxy` the header is ignored outright.
      name: 'a forged X-Forwarded-Host',
      path: '/signup',
      headers: { Origin: 'https://evil.example', 'x-forwarded-host': 'evil.example', 'sec-fetch-site': 'cross-site' },
      body: signupBody(),
    },
  ];

  for (const { name, path, headers, body } of cases) {
    const res = await fetch(`${base}${path}`, { method: 'POST', headers, body });
    await res.text();
    assert.equal(res.status, 403, `${name} should have been rejected`);
  }
});

test('X-Forwarded-Host cannot poison the public request URL without trustProxy', async () => {
  const flight = await (
    await fetch(`${base}/whoami`, {
      headers: { Accept: 'text/x-component', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' },
    })
  ).text();
  assert.doesNotMatch(flight, /evil\.example/, 'a client-supplied forwarded host reached the URL the app builds');
  assert.match(flight, new RegExp(base.replace('http://', '')), 'the real request host should be used instead');
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

test('an action id the app does not export is a 400, not a fault or a prototype lookup', async () => {
  const logsBefore = getOutput().length;
  for (const id of ['not-a-real-action-id', '__proto__']) {
    const res = await fetch(`${base}/users`, {
      method: 'POST',
      headers: { Origin: base, 'x-rsc-action': id, 'content-type': 'text/plain' },
      body: '[]',
    });
    await res.text();
    assert.equal(res.status, 400, `"${id}" must be rejected as a bad request`);
  }
  assert.doesNotMatch(getOutput().slice(logsBefore), /TypeError/, 'an unknown action id must not fault into a stack trace');
});

test('the body-size cap covers endpoint routes and the server sub-app, not just actions', async () => {
  // Deliberately not `fetch`: the cap is enforced before the body is read, so the server answers
  // while the 2MB upload is still in flight and resets the connection. That's correct — but it
  // would leave a poisoned socket in undici's shared keep-alive pool for a later test to trip over.
  const status = await postWithoutKeepAlive('/api/users', JSON.stringify({ name: 'x'.repeat(2 * 1024 * 1024), email: 'big@example.com' }));
  assert.equal(status, 413, 'a 2MB body to a sub-app route should be refused by the 1MiB default cap');
});
