import type { Context, Handler } from 'hono';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode, RedirectStatusCode } from 'hono/utils/http-status';
import type React from 'react';
import type { ReactFormState } from 'react-dom/client';
// The JSX factory, by name: the page element is created with this directly rather than as
// `<Page {...props} />`, because a spread would drop the non-enumerable `ctx` prop. See `pageProps`.
import { jsx } from 'react/jsx-runtime';
// The bare specifier, not `/server.node`: the package ships a build per runtime behind export
// conditions (`node`, `workerd`, `deno`, `edge-light`), and the RSC layer's `conditionNames` is what
// picks one — so a non-Node deploy target gets its own build instead of Node's by hard-coded path.
import {
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction,
  renderToReadableStream,
  type ServerEntry,
  type TemporaryReferenceSet,
} from 'react-server-dom-rspack/server';
// Resolved by the '@rshono/deploy' alias to the selected preset's runtime module — the one place
// this file knows anything about where it is running. See `deploy/contract.ts`.
import { runtime } from '@rshono/deploy';
// @ts-expect-error — resolved by the '@rshono/routes' alias to the app's routes.ts
import { routes as userRoutes } from '@rshono/routes';
// @ts-expect-error — resolved by the '@rshono/server-app' alias (src/server.ts or the empty fallback)
import * as serverAppModule from '@rshono/server-app';
import { isPageRoute, type ErrorPageInfo, type FallbackPage, type PageComponent, type PageProps, type Route, type RouteConfig } from '../router.js';
import { appendVary, etagMatches } from '../server/headers.js';
import { getRequestContext, publicUrl, readParams, reportServerError, runWithContext } from './context.js';
import { isControlSignal, RedirectSignal, type ControlSignal } from './control.js';
import { renderHTML } from './entry.ssr.js';
// Type-only, so it is erased — the RSC layer does not take its own instance of the SSR layer's module.
import type { CancellableTransformer } from './flight-inject.js';
import { RouterProvider } from './navigation.js';
import { acceptsRsc, isActionRequest, parseRenderRequest, requestWantsRsc, wantsRsc } from './request.js';

const serverApp = ((serverAppModule as { default?: unknown }).default ?? null) as Hono | null;

// Framework settings resolved from rshono.config.ts and compiled into the bundle at build time
// (see builder/rspack-config.ts). These have no runtime env-var interface — env is for secrets.
// Named after their ServerConfig fields, so what a setting does here is one grep from where it is
// resolved. `isDev` among them: the build mode is decided by which command produced the bundle, not
// by `process.env.NODE_ENV`, and not every runtime this deploys to has a `process` to read anyway.
const CONFIG = __RSHONO_CONFIG__;
const { isDev, cspEnabled, checkOrigin, maxBodyBytes } = CONFIG;
/** Extra cross-origin hosts permitted to post server actions, beyond the app's own origin. */
const allowedOrigins = new Set(CONFIG.allowedOrigins);

/** How long a prerendered page may be reused before revalidating. Also what `public/` files get. */
const SSG_CACHE_CONTROL = 'public, max-age=300';

/**
 * The two content types a page can be served as. Both come back from the *same* URL depending on
 * the `Accept` header, which is what makes `Vary` non-optional here.
 */
const PAGE_CONTENT_TYPE = /^(?:text\/html|text\/x-component)\b/;

// The CSP is fixed per build apart from the nonce, so assemble everything but `script-src` once.
const CSP_STATIC = Object.entries(CONFIG.cspDirectives)
  .filter(([name]) => name !== 'script-src')
  .map(([name, value]) => `${name} ${value}`)
  .join('; ');
const CSP_SCRIPT_SRC = CONFIG.cspDirectives['script-src'] ?? "'self'";

// Called here rather than at the top of the deploy runtime's own module so the timing is unchanged:
// `.env` is loaded once every import above has been evaluated, exactly as before.
runtime.loadEnv();

const routeConfig = userRoutes as RouteConfig;
export const routes: readonly Route[] = routeConfig.routes;

/** The result of a server action, as a discriminated union (a `Result<T, E>`) rather than an `ok` flag over one field. */
export type ActionResult = { ok: true; value: unknown } | { ok: false; error: unknown };

export type RscPayload = {
  root: React.ReactNode;
  returnValue?: ActionResult;
  formState?: ReactFormState;
  redirect?: string;
  notFound?: boolean;
};

/**
 * CSRF guard for server-action POSTs, layering the two signals a browser gives us.
 *
 * `Sec-Fetch-Site` is set by the browser and unforgeable by page script, so `same-origin` settles
 * the question on its own — and short-circuiting on it is what keeps the check from misfiring on a
 * legitimate request whose `Host` the proxy rewrote. Everything else falls back to comparing the
 * `Origin` host against our own (see {@link publicUrl} — deliberately *not* against a raw
 * `X-Forwarded-Host`, which the client controls unless `trustProxy` says a proxy owns it).
 *
 * A missing `Origin` is treated as same-origin: no-JS form posts from older browsers omit it, and
 * those same browsers send no `Sec-Fetch-Site` either, so there is nothing left to check. Hosts are
 * compared case-insensitively; the scheme is not compared, so this alone won't stop an
 * `http://` origin posting to the `https://` site (HSTS is the control for that).
 */
function isSameOriginAction(c: Context): boolean {
  if (!checkOrigin) return true;

  const secFetchSite = c.req.header('sec-fetch-site');
  if (secFetchSite === 'same-origin') return true;

  const origin = c.req.header('origin');
  const originHost = origin ? URL.parse(origin)?.host.toLowerCase() || null : null;
  if (origin !== undefined && originHost === null) return false; // an Origin we can't parse is untrusted.

  const trusted = originHost !== null && (originHost === publicUrl(c).host.toLowerCase() || allowedOrigins.has(originHost));

  if (secFetchSite && secFetchSite !== 'none') {
    // The browser tells us (unforgeably) this didn't originate from our own site — only a
    // trusted (allowlisted) Origin may proceed.
    return trusted;
  }

  if (originHost === null) return true;
  return trusted;
}

async function loadPageModule(load: () => Promise<{ default: PageComponent }>, label: string): Promise<ServerEntry<PageComponent>> {
  const mod = await load();
  const Page = mod.default as ServerEntry<PageComponent> | undefined;
  if (typeof Page !== 'function') {
    throw new Error(`[rshono] The page module for ${label} must default-export a server component.`);
  }
  if (!Page.entryJsFiles) {
    throw new Error(
      `[rshono] The page component for ${label} is missing its client-asset info ('use server-entry'). ` +
        "The directive is added automatically for inline `component: () => import('…')` thunks in routes.ts. " +
        "If this page is wired up another way, put 'use server-entry' on the first line of the page module yourself — " +
        "and make sure the page is a server component (a 'use client' page must be wrapped by a server component instead).",
    );
  }
  return Page;
}

/** A browser navigation or a crawler, as opposed to a fetch that would rather have plain text. */
function acceptsHtml(c: Context): boolean {
  return c.req.header('accept')?.includes('text/html') ?? false;
}

/** A lazy once-cell: runs `load` at most once and caches the promise, but clears a rejection so a later call can retry. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => {
    if (!promise) {
      const pending = (promise = load());
      pending.catch(() => {
        // Only clear if we're still holding the rejected promise (a later successful load may have already replaced it).
        if (promise === pending) promise = undefined;
      });
    }
    return promise;
  };
}

/**
 * Passes `stream` through untouched, calling `done` once it ends — however it ends.
 *
 * Used on the flight-only response path, which has no transform of its own to hang a completion hook
 * off (the document path has {@link injectFlightPayload}). `done` must be idempotent: a cancelled
 * response can reach both `cancel` and the abort forwarder.
 */
function releaseWhenDone(stream: ReadableStream<Uint8Array>, done: () => void): ReadableStream<Uint8Array> {
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
      flush: done,
      cancel: done,
    } as CancellableTransformer<Uint8Array, Uint8Array>),
  );
}

interface ComponentRenderOptions {
  status?: number;
  isRsc: boolean;
  formState?: ReactFormState;
  returnValue?: RscPayload['returnValue'];
  temporaryReferences?: TemporaryReferenceSet;
  /** Passed when the page being rendered is the `error` page, which takes it as an extra prop. */
  errorInfo?: ErrorPageInfo;
  /** Marks the payload as the not-found page, so a soft navigation can tell it apart from the page it asked for. */
  notFound?: boolean;
}

/**
 * There is no render deadline here any more.
 *
 * A `renderTimeout` setting used to wrap every request in an `AbortController` with a timer, covering
 * the server action as well as the flight and SSR passes. Every host this deploys to enforces its own
 * request timeout — Workers, Vercel and Lambda all do — so the only shape that needed one was a Node
 * process facing the internet directly, and there a proxy is both the conventional and the more capable
 * place for it. The README shows the middleware for a Node deploy that wants one in-process.
 *
 * What the deadline *also* did was carry the client-disconnect signal into the two React renderers, and
 * that is kept — but not by handing them `c.req.raw.signal`. Both React renderers add an `abort`
 * listener to whatever signal they are given and only remove it if the abort fires, so a listener left on
 * a request-lifetime signal pins the flight request, the Fizz request and the whole rendered tree. That
 * is not theoretical: handing them the request signal directly cost ~169 kB per `/ssr` request, never
 * reclaimed by a major GC, and took GC from 5.8% to 12.9% of wall time under load.
 *
 * The deadline's own `AbortController` was, accidentally, what had kept that collectable — its signal
 * died with the render. So {@link renderComponent} keeps a per-render controller and forwards the request
 * signal into it, releasing the forwarder when the response ends. Never through `AbortSignal.any([...])`,
 * which reads better and leaks worse: a signal it produced is *composite*, and Node holds every composite
 * signal carrying an `abort` listener in a process-lifetime set (`gcPersistentSignals`) until it either
 * aborts or loses its last listener.
 */

/**
 * Builds the props a page component is called with.
 *
 * `url` and `params` match `useNavigation()` field for field, so a read can move between a page and
 * a `'use client'` component unchanged. The `URL` is this page's own — `RequestContext` parses its own — so a
 * page that mutates it cannot disturb anything else on the request.
 *
 * `ctx` is *defined* rather than assigned, and both parts of how carry their weight:
 *
 * - **A getter**, so nothing is built for the pages that never read it, and so a `render: 'static'`
 *   page that does read it gets {@link getRequestContext}'s own "no per-request context while
 *   prerendering" error rather than a bare `undefined` — one explanation, in one place.
 * - **Non-enumerable**, so React's *development-only* serialization of a server component's props
 *   (the debug channel behind component stacks and the performance track) skips it. That walks own
 *   enumerable properties, and `ctx.raw` is the Hono {@link Context} — whose `env` holds the
 *   runtime's bindings. An enumerable `ctx` ships every one of them, secrets included, to the
 *   browser in dev, and grows a small page's flight payload by well over 10 kB. Production never
 *   serializes a server component's props at all, so this is the dev half of the same guarantee.
 *
 * The cost is that the element has to be created by handing this object to `jsx()` *by reference*:
 * a `<Page {...props} />` spread copies enumerable properties only, and would drop `ctx` silently.
 */
function pageProps(c: Context, errorInfo: ErrorPageInfo | undefined): PageProps & { error?: ErrorPageInfo } {
  const props = { url: publicUrl(c), params: readParams(c), ...(errorInfo ? { error: errorInfo } : null) };
  Object.defineProperty(props, 'ctx', { get: getRequestContext, enumerable: false, configurable: true });
  return props as PageProps & { error?: ErrorPageInfo };
}

async function renderComponent(c: Context, Page: ServerEntry<PageComponent>, opts: ComponentRenderOptions): Promise<Response> {
  // The client going away is the one thing that still aborts a render — but React's renderers must not
  // be handed `c.req.raw.signal` to watch for it. Both of them add an `abort` listener and only remove
  // it if the abort fires, so on the happy path the listener stays on a signal that lives as long as the
  // request object, and through it pins the flight request, the Fizz request and the whole rendered
  // tree. Measured at ~169 kB per `/ssr` request, never reclaimed by a major GC.
  //
  // So the render gets a controller of its own and the request signal only forwards into it. The
  // forwarding listener is `once`, so an abort removes it, and {@link release} removes it on the normal
  // path — which is what keeps the request from retaining the render. Deliberately not
  // `AbortSignal.any()`: a signal it produced is *composite*, and Node holds every composite signal
  // carrying an `abort` listener in a process-lifetime set until it aborts or loses its last listener,
  // which is a worse leak than the one being fixed here.
  const requestSignal = c.req.raw.signal;
  const renderAbort = new AbortController();
  const signal = renderAbort.signal;
  const forwardAbort = () => renderAbort.abort(requestSignal.reason);
  if (requestSignal.aborted) renderAbort.abort(requestSignal.reason);
  else requestSignal.addEventListener('abort', forwardAbort, { once: true });
  /** Detaches the forwarder once the response has been written, so nothing survives the request. */
  const release = () => requestSignal.removeEventListener('abort', forwardAbort);

  const nonce = cspEnabled && !opts.isRsc ? crypto.randomUUID() : undefined;
  const props = pageProps(c, opts.errorInfo);
  const root = (
    <>
      {nonce && <meta property="csp-nonce" nonce={nonce} />}
      {Page.entryCssFiles?.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}
      {/* `href`, not the `URL` itself: these props cross into a client component, so they have to be serializable. */}
      <RouterProvider href={props.url.href} params={props.params}>
        {jsx(Page, props)}
      </RouterProvider>
    </>
  );

  // `notFound` only when it is true, so the flight payload of an ordinary page doesn't carry the key.
  const rscPayload: RscPayload = { root, formState: opts.formState, returnValue: opts.returnValue, ...(opts.notFound ? { notFound: true } : null) };

  let controlSignal: ControlSignal | undefined;
  const rscStream = renderToReadableStream(rscPayload, {
    temporaryReferences: opts.temporaryReferences,
    signal,
    onError(error) {
      if (isControlSignal(error)) {
        controlSignal = error;
        return error.digest;
      }
      if (!signal.aborted) reportServerError(error, { source: 'render', request: c.req.raw, message: '[rshono] render error:' });
    },
  });

  if (opts.isRsc) {
    return c.body(releaseWhenDone(rscStream, release), (opts.status ?? 200) as ContentfulStatusCode, {
      'content-type': 'text/x-component;charset=utf-8',
    });
  }

  let ssrResult: Awaited<ReturnType<typeof renderHTML>>;
  try {
    ssrResult = await renderHTML(rscStream, {
      bootstrapScripts: Page.entryJsFiles,
      formState: opts.formState,
      signal,
      nonce,
      onDone: release,
      onShellError: (error) => reportServerError(error, { source: 'ssr', request: c.req.raw, message: '[rshono] SSR shell error:' }),
      onError: (error) => reportServerError(error, { source: 'ssr', request: c.req.raw, message: '[rshono] SSR error:' }),
    });
  } catch (error) {
    release();
    if (controlSignal) throw controlSignal;
    throw error;
  }
  if (controlSignal) {
    release();
    throw controlSignal;
  }
  const headers: Record<string, string> = { 'content-type': 'text/html;charset=utf-8' };
  if (nonce) {
    // The nonce is always appended to whatever `script-src` resolved to, so overriding the
    // directive in `cspDirectives` can widen the policy but can't accidentally drop the nonce.
    // Dev additionally needs 'unsafe-eval' for react-refresh.
    const scriptSrc = `script-src ${CSP_SCRIPT_SRC} 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''}`;
    headers['content-security-policy'] = CSP_STATIC ? `${CSP_STATIC}; ${scriptSrc}` : scriptSrc;
  }
  return c.body(ssrResult.stream, (ssrResult.status ?? opts.status ?? 200) as ContentfulStatusCode, headers);
}

async function renderPage(c: Context, loadPage: () => Promise<ServerEntry<PageComponent>>): Promise<Response> {
  const request = c.req.raw;
  const renderRequest = parseRenderRequest(request);

  let returnValue: ActionResult | undefined;
  let formState: ReactFormState | undefined;
  let temporaryReferences: TemporaryReferenceSet | undefined;
  let actionStatus: number | undefined;
  if (isActionRequest(renderRequest)) {
    if (!isSameOriginAction(c)) {
      return c.text('Forbidden: cross-origin server action rejected', 403);
    }
    if (renderRequest.kind === 'rsc-action') {
      // Checked before the body is decoded, so an unknown id costs nothing to reject — and
      // `loadServerAction` would otherwise fault on the missing manifest entry, turning a bad
      // request into an unhandled 500. `hasOwn` so `__proto__` doesn't resolve to a manifest entry.
      if (!Object.hasOwn(__rspack_rsc_manifest__.serverManifest, renderRequest.actionId)) {
        return c.text('Bad Request: unknown server action', 400);
      }
      const contentType = request.headers.get('content-type');
      const body = contentType?.startsWith('multipart/form-data') ? await request.formData() : await request.text();
      temporaryReferences = createTemporaryReferenceSet();
      const args = await decodeReply<unknown[]>(body, { temporaryReferences });
      const action = loadServerAction(renderRequest.actionId);
      try {
        returnValue = { ok: true, value: await action.apply(null, args) };
      } catch (error) {
        if (isControlSignal(error)) throw error;
        // React sends a thrown action error to the client as an opaque marker in production — no
        // message, no digest — so without this the failure would be invisible on both ends.
        reportServerError(error, { source: 'action', request, message: '[rshono] server action error:' });
        returnValue = { ok: false, error };
        actionStatus = 500;
      }
    } else {
      const formData = await request.formData();
      const decodedAction = await decodeAction(formData, __rspack_rsc_manifest__.serverManifest);
      if (decodedAction) {
        const result = await decodedAction();
        formState = (await decodeFormState(result, formData, __rspack_rsc_manifest__.serverManifest)) ?? undefined;
      }
    }
  }

  const Page = await loadPage();
  return renderComponent(c, Page, {
    status: actionStatus,
    isRsc: wantsRsc(renderRequest),
    formState,
    returnValue,
    temporaryReferences,
  });
}

function buildApp(): Hono {
  const app = new Hono();

  // Cheap, unconditional headers that only matter when something else has gone wrong: stop
  // content-type sniffing, keep the full URL (paths, query) out of cross-origin referrers, and
  // refuse to be framed by another origin (clickjacking). `frame-ancestors` in the opt-in CSP is
  // stricter and takes precedence where both apply; this is the floor for everyone else.
  // Set after `next()` so a route or middleware that sets its own value wins.
  app.use(async (c, next) => {
    await next();
    const headers = c.res.headers;
    if (!headers.has('x-content-type-options')) headers.set('x-content-type-options', 'nosniff');
    if (!headers.has('referrer-policy')) headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    if (!headers.has('x-frame-options')) headers.set('x-frame-options', 'SAMEORIGIN');

    // Page responses only, from here down. Two things are true of them and of nothing else served
    // here: one URL answers with either an HTML document or a flight payload depending on `Accept`,
    // and the default page is request-specific (cookies, session, headers).
    if (!PAGE_CONTENT_TYPE.test(headers.get('content-type') ?? '')) return;
    appendVary(headers, 'Accept');
    // Without this a page carries no cache directives at all, and a shared cache — a CDN, a
    // corporate proxy — is free to store a logged-in user's page and hand it to someone else.
    // `private` forbids exactly that; `no-cache` makes the browser revalidate its own copy rather
    // than re-showing a stale personalised page. Neither blocks bfcache, which `no-store` would.
    // A prerendered page, or anything a route set deliberately, already has its own value.
    if (!headers.has('cache-control')) headers.set('cache-control', 'private, no-cache');
  });

  // A memory-exhaustion guard for *every* route — pages and actions, `{ type: 'endpoint' }` routes
  // and the src/server.ts sub-app alike — since anything that buffers a body (`.json()`,
  // `.formData()`) is exposed, not just server actions. Rejects an over-cap `Content-Length` up
  // front and otherwise counts the stream, so a chunked or under-reported body is still cut off.
  if (maxBodyBytes > 0) {
    app.use(bodyLimit({ maxSize: maxBodyBytes, onError: (c) => c.text('Payload Too Large', 413) }));
  }

  runtime.mountStaticAssets(app);

  // Mounted ahead of the page routes so the sub-app's middleware (auth, logging, trailing-slash)
  // wraps page requests too. The flip side: a *terminal* handler in src/server.ts at the same path
  // as a page route wins over the page.
  if (serverApp) {
    app.route('/', serverApp);
  }

  const memoizePage = (page: FallbackPage, label: string) => once(() => loadPageModule(page.component, label));
  const loadNotFoundPage = routeConfig.notFound ? memoizePage(routeConfig.notFound, 'the notFound page') : null;

  /** Turns a thrown `redirect()` / `notFound()` into the response it stands for. */
  const respondToControlSignal = async (c: Context, signal: ControlSignal): Promise<Response> => {
    const isRsc = requestWantsRsc(c.req.raw);
    if (signal instanceof RedirectSignal) {
      if (isRsc) {
        return c.body(renderToReadableStream({ root: null, redirect: signal.location } satisfies RscPayload, { signal: c.req.raw.signal }), 200, {
          'content-type': 'text/x-component;charset=utf-8',
        });
      }
      return c.redirect(signal.location, signal.status as RedirectStatusCode);
    }
    if (loadNotFoundPage) {
      return renderComponent(c, await loadNotFoundPage(), { status: 404, isRsc, notFound: true });
    }
    // Plain text, but still one of the two answers this URL gives depending on `Accept`.
    return c.text('Not Found', 404, { vary: 'Accept' });
  };

  for (const route of routes) {
    if (isPageRoute(route)) {
      // Both are fixed for the life of the process, so resolve them once here instead of per request.
      const servesPrerendered = !isDev && route.render === 'static';
      const loadPage = once(() => loadPageModule(route.component, `"${route.path}"`));

      const handler: Handler = async (c) => {
        try {
          if (servesPrerendered && c.req.method === 'GET') {
            const isRsc = acceptsRsc(c.req.raw);
            // A prerendered file is one fixed set of bytes, so it cannot carry a per-request nonce:
            // under `csp` the *document* has to be rendered per request. The flight payload never
            // carries a nonce, so it stays servable from the build either way.
            const mustRenderForNonce = cspEnabled && !isRsc;
            // Otherwise both representations come from the build, so a soft navigation is served from
            // it too rather than re-rendering a page that was already built.
            if (!mustRenderForNonce) {
              const page = await runtime.readPrerendered(c, isRsc ? 'flight' : 'html');
              // A prerendered page is request-independent by construction, so it is safe to cache
              // publicly; the short max-age matches what `public/` files get. The ETag turns the
              // revalidation that follows into a 304 rather than the page all over again.
              //
              // Answered outside `runWithContext`: no app code runs on this path, so there is no
              // `getRequestContext()` to serve and no reason to pay for the AsyncLocalStorage scope.
              if (page !== null) {
                const headers = {
                  'cache-control': SSG_CACHE_CONTROL,
                  etag: page.etag,
                  vary: 'Accept',
                  'content-type': isRsc ? 'text/x-component;charset=utf-8' : 'text/html;charset=utf-8',
                };
                if (etagMatches(c.req.header('if-none-match'), page.etag)) return c.body(null, 304, headers);
                return c.body(page.body, 200, { ...headers, 'content-length': page.contentLength });
              }
            }
          }
          return await runWithContext(c, () => renderPage(c, loadPage));
        } catch (error) {
          if (isControlSignal(error)) return runWithContext(c, () => respondToControlSignal(c, error));
          throw error;
        }
      };
      app.on(['GET', 'POST'], route.path, handler);
    } else {
      const loadEndpoint = once(() => route.server());
      const handler: Handler = async (c, next) => {
        const { handler: endpointHandler } = await loadEndpoint();
        return endpointHandler(c, next);
      };
      const method = route.method ?? 'all';
      if (method === 'all') app.all(route.path, handler);
      else app.on(method.toUpperCase(), route.path, handler);
    }
  }

  runtime.mountPublicFallback(app);

  app.notFound(async (c) => {
    const isRsc = requestWantsRsc(c.req.raw);
    if (loadNotFoundPage && (isRsc || acceptsHtml(c))) {
      return runWithContext(c, async () => renderComponent(c, await loadNotFoundPage(), { status: 404, isRsc }));
    }
    return c.text('Not Found', 404, { vary: 'Accept' });
  });

  const loadErrorPage = routeConfig.error ? memoizePage(routeConfig.error, 'the error page') : null;
  app.onError(async (error, c) => {
    if (isControlSignal(error)) return runWithContext(c, () => respondToControlSignal(c, error));
    reportServerError(error, { source: 'request', request: c.req.raw, message: '[rshono] request error:' });
    const isRsc = requestWantsRsc(c.req.raw);
    if (loadErrorPage && (isRsc || acceptsHtml(c))) {
      const errorInfo: ErrorPageInfo = isDev
        ? {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          }
        : { message: 'Internal Server Error' };
      try {
        return await runWithContext(c, async () => renderComponent(c, await loadErrorPage(), { status: 500, isRsc, errorInfo }));
      } catch (renderError) {
        reportServerError(renderError, { source: 'request', request: c.req.raw, message: '[rshono] the error page failed to render:' });
      }
    }
    const detail = isDev ? `\n\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}` : '';
    return c.text(`Internal Server Error${detail}`, 500, { vary: 'Accept' });
  });

  return app;
}

export const app = buildApp();

/**
 * The app, handed to whatever is hosting it.
 *
 * On a platform where rshono owns the process this binds a port and the default export is nothing;
 * where the host owns it, this *is* the export the platform looks for — so the same entry serves
 * both without a per-platform entry file. `app` and `routes` stay named exports either way, because
 * `rshono build` imports them to prerender `render: 'static'` routes.
 */
export default runtime.serveApp(app);
