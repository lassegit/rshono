import { serve } from '@hono/node-server';
import type { Context, Handler } from 'hono';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode, RedirectStatusCode } from 'hono/utils/http-status';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import type React from 'react';
import type { ReactFormState } from 'react-dom/client';
import {
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction,
  renderToReadableStream,
  type ServerEntry,
  type TemporaryReferenceSet,
} from 'react-server-dom-rspack/server.node';
// @ts-expect-error — resolved by the '@rshono/routes' alias to the app's routes.ts
import { routes as userRoutes } from '@rshono/routes';
// @ts-expect-error — resolved by the '@rshono/server-app' alias (src/server.ts or the empty fallback)
import * as serverAppModule from '@rshono/server-app';
import {
  isPageRoute,
  type EndpointRoute,
  type ErrorInfo,
  type PageComponent,
  type PageRoute,
  type Route,
  type RouteConfig,
  type SpecialPage,
} from '../router.js';
import { loadEnvFiles } from '../server/load-env.js';
import { onShutdown } from '../server/shutdown.js';
import { readPrerendered } from '../server/ssg.js';
import { createPublicFallback, createStaticMiddleware } from '../server/static.js';
import { publicUrl, readParams, runWithContext } from './context.js';
import { isControlSignal, RedirectSignal, type ControlSignal } from './control.js';
import { renderHTML } from './entry.ssr.js';
import { RouterProvider } from './navigation.js';
import { isActionRequest, parseRenderRequest, wantsRsc } from './request.js';

const isDev = process.env.NODE_ENV === 'development';
const rootDir = join(import.meta.dirname, '..', '..');

const serverApp = ((serverAppModule as { default?: unknown }).default ?? null) as Hono | null;

// Framework settings resolved from rshono.config.ts and compiled into the bundle at build time
// (see builder/rspack-config.ts). These have no runtime env-var interface — env is for secrets.
const CONFIG = __RSHONO_CONFIG__;
const RENDER_TIMEOUT_MS = CONFIG.renderTimeoutMs;
const cspEnabled = CONFIG.cspEnabled;
const checkOrigin = CONFIG.checkOrigin; // CSRF origin check on action POSTs.
const allowedOrigins = new Set(CONFIG.allowedOrigins); // extra cross-origin hosts permitted to post actions.
const MAX_BODY_BYTES = CONFIG.maxBodyBytes; // request body cap in bytes; 0 disables it.

// The CSP is fixed per build apart from the nonce, so assemble everything but `script-src` once.
const CSP_STATIC = Object.entries(CONFIG.cspDirectives)
  .filter(([name]) => name !== 'script-src')
  .map(([name, value]) => `${name} ${value}`)
  .join('; ');
const CSP_SCRIPT_SRC = CONFIG.cspDirectives['script-src'] ?? "'self'";

loadEnvFiles(rootDir);

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
  const originHost = origin ? (URL.parse(origin)?.host.toLowerCase() || null) : null;
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

function loadPage(route: PageRoute): Promise<ServerEntry<PageComponent>> {
  return loadPageModule(route.component, `"${route.path}"`);
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

interface ComponentRenderOptions {
  status?: number;
  isRsc: boolean;
  formState?: ReactFormState;
  returnValue?: RscPayload['returnValue'];
  temporaryReferences?: TemporaryReferenceSet;
  extraProps?: Record<string, unknown>;
  payloadExtras?: Pick<RscPayload, 'redirect' | 'notFound'>;
  /** An already-running deadline to render under — passed when the request spent time on an action first. */
  deadline?: RenderDeadline;
}

interface RenderDeadline {
  /** The request signal combined with the timeout — pass to the RSC/SSR renderers. */
  readonly signal: AbortSignal;
  /** Releases the timer now — call on an error path where nothing will stream. */
  clear(): void;
  /** Wraps a response stream so the timer is released once its last byte flushes. */
  guard(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array>;
  /**
   * Settles with `work`, or rejects the moment the deadline (or the client disconnect) fires —
   * for the phases that take a plain promise rather than an {@link AbortSignal}, i.e. running a
   * server action. The abandoned work keeps running to completion; we just stop holding the
   * socket open for it.
   */
  race<T>(work: T | PromiseLike<T>): Promise<T>;
}

/**
 * Owns the render-deadline lifecycle in one place (the RAII / `defer` pattern — a
 * `using` declaration doesn't fit because the timer must outlive this call to keep
 * guarding the *stream*, not just the function scope). The timer is released on
 * exactly one of: the stream finishing ({@link RenderDeadline.guard}), an explicit
 * {@link RenderDeadline.clear} on an error path, or the signal aborting (client
 * disconnect, or the deadline firing itself). A manually-cleared timer instead of
 * `AbortSignal.timeout()` so a fast response doesn't leave one pending to fire later.
 *
 * One deadline covers the whole request — server action included, not just the render — so a
 * hung action can't pin a socket open indefinitely either.
 */
function createRenderDeadline(requestSignal: AbortSignal, ms: number): RenderDeadline {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`[rshono] request exceeded ${ms}ms`)), ms);
  timer.unref?.();
  const signal = AbortSignal.any([requestSignal, controller.signal]);
  const clear = () => clearTimeout(timer);
  signal.addEventListener('abort', clear, { once: true });
  return {
    signal,
    clear,
    guard: (stream) => stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ flush: clear })),
    race<T>(work: T | PromiseLike<T>): Promise<T> {
      if (signal.aborted) return Promise.reject(signal.reason);
      const { promise: aborted, reject } = Promise.withResolvers<never>();
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      // `Promise.race` subscribes to `work` either way, so abandoning it can't surface as an
      // unhandled rejection. Detach on settle so a long-lived signal doesn't accumulate listeners.
      return Promise.race([work, aborted]).finally(() => signal.removeEventListener('abort', onAbort));
    },
  };
}

async function renderComponent(c: Context, Page: ServerEntry<PageComponent>, opts: ComponentRenderOptions): Promise<Response> {
  const deadline = opts.deadline ?? createRenderDeadline(c.req.raw.signal, RENDER_TIMEOUT_MS);
  const signal = deadline.signal;

  const nonce = cspEnabled && !opts.isRsc ? crypto.randomUUID() : undefined;
  const params = readParams(c);
  const props = { params, url: publicUrl(c).toString(), ...opts.extraProps };
  const root = (
    <>
      {nonce && <meta property="csp-nonce" nonce={nonce} />}
      {Page.entryCssFiles?.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}
      <RouterProvider href={props.url} params={params}>
        <Page {...props} />
      </RouterProvider>
    </>
  );

  const rscPayload: RscPayload = { root, formState: opts.formState, returnValue: opts.returnValue, ...opts.payloadExtras };

  let controlSignal: ControlSignal | undefined;
  const rscStream = renderToReadableStream(rscPayload, {
    temporaryReferences: opts.temporaryReferences,
    signal,
    onError(error) {
      if (isControlSignal(error)) {
        controlSignal = error;
        return error.digest;
      }
      if (!signal.aborted) console.error('[rshono] render error:', error);
    },
  });

  if (opts.isRsc) {
    return c.body(deadline.guard(rscStream), (opts.status ?? 200) as ContentfulStatusCode, {
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
    });
  } catch (error) {
    deadline.clear();
    if (controlSignal) throw controlSignal;
    throw error;
  }
  if (controlSignal) {
    deadline.clear();
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
  return c.body(deadline.guard(ssrResult.stream), (ssrResult.status ?? opts.status ?? 200) as ContentfulStatusCode, headers);
}

async function renderPage(c: Context, route: PageRoute): Promise<Response> {
  const request = c.req.raw;
  const renderRequest = parseRenderRequest(request);
  // Created before the action runs so the deadline covers the whole request, then handed to
  // `renderComponent` so the render doesn't get a fresh budget of its own.
  const deadline = createRenderDeadline(request.signal, RENDER_TIMEOUT_MS);

  let returnValue: ActionResult | undefined;
  let formState: ReactFormState | undefined;
  let temporaryReferences: TemporaryReferenceSet | undefined;
  let actionStatus: number | undefined;
  if (isActionRequest(renderRequest)) {
    if (!isSameOriginAction(c)) {
      deadline.clear();
      return c.text('Forbidden: cross-origin server action rejected', 403);
    }
    if (renderRequest.kind === 'rsc-action') {
      // Checked before the body is decoded, so an unknown id costs nothing to reject — and
      // `loadServerAction` would otherwise fault on the missing manifest entry, turning a bad
      // request into an unhandled 500. `hasOwn` so `__proto__` doesn't resolve to a manifest entry.
      if (!Object.hasOwn(__rspack_rsc_manifest__.serverManifest, renderRequest.actionId)) {
        deadline.clear();
        return c.text('Bad Request: unknown server action', 400);
      }
      const contentType = request.headers.get('content-type');
      const body = contentType?.startsWith('multipart/form-data') ? await request.formData() : await request.text();
      temporaryReferences = createTemporaryReferenceSet();
      const args = await decodeReply<unknown[]>(body, { temporaryReferences });
      const action = loadServerAction(renderRequest.actionId);
      try {
        returnValue = { ok: true, value: await deadline.race(action.apply(null, args)) };
      } catch (error) {
        if (isControlSignal(error)) throw error;
        // React sends a thrown action error to the client as an opaque marker in production — no
        // message, no digest — so without this the failure would be invisible on both ends.
        console.error('[rshono] server action error:', error);
        returnValue = { ok: false, error };
        actionStatus = 500;
      }
    } else {
      const formData = await request.formData();
      const decodedAction = await decodeAction(formData, __rspack_rsc_manifest__.serverManifest);
      if (decodedAction) {
        const result = await deadline.race(decodedAction());
        formState = (await decodeFormState(result, formData, __rspack_rsc_manifest__.serverManifest)) ?? undefined;
      }
    }
  }

  const Page = await loadPage(route);
  return renderComponent(c, Page, {
    status: actionStatus,
    isRsc: wantsRsc(renderRequest),
    formState,
    returnValue,
    temporaryReferences,
    deadline,
  });
}

function buildApp(): Hono {
  const app = new Hono();

  // Cheap, unconditional headers that only matter when something else has gone wrong: stop
  // content-type sniffing, and keep the full URL (paths, query) out of cross-origin referrers.
  // Set after `next()` so a route or middleware that sets its own value wins.
  app.use(async (c, next) => {
    await next();
    if (!c.res.headers.has('x-content-type-options')) c.res.headers.set('x-content-type-options', 'nosniff');
    if (!c.res.headers.has('referrer-policy')) c.res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  });

  // A memory-exhaustion guard for *every* route — pages and actions, `{ type: 'endpoint' }` routes
  // and the src/server.ts sub-app alike — since anything that buffers a body (`.json()`,
  // `.formData()`) is exposed, not just server actions. Rejects an over-cap `Content-Length` up
  // front and otherwise counts the stream, so a chunked or under-reported body is still cut off.
  if (MAX_BODY_BYTES > 0) {
    app.use(bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.text('Payload Too Large', 413) }));
  }

  app.route(
    '/_static',
    createStaticMiddleware({
      roots: [join(rootDir, 'dist', 'static')],
      isDev,
    }),
  );

  // Mounted ahead of the page routes so the sub-app's middleware (auth, logging, trailing-slash)
  // wraps page requests too. The flip side: a *terminal* handler in src/server.ts at the same path
  // as a page route wins over the page.
  if (serverApp) {
    app.route('/', serverApp);
  }

  const ssgDir = join(rootDir, 'dist', 'ssg');

  const memoizePage = (page: SpecialPage, label: string) => once(() => loadPageModule(page.component, label));
  const loadNotFoundPage = routeConfig.notFound ? memoizePage(routeConfig.notFound, 'the notFound page') : null;

  const resolveControl = async (c: Context, signal: ControlSignal): Promise<Response> => {
    const isRsc = wantsRsc(parseRenderRequest(c.req.raw));
    if (signal instanceof RedirectSignal) {
      if (isRsc) {
        return c.body(
          renderToReadableStream({ root: null, redirect: signal.location } satisfies RscPayload, { signal: c.req.raw.signal }),
          200,
          { 'content-type': 'text/x-component;charset=utf-8' },
        );
      }
      return c.redirect(signal.location, signal.status as RedirectStatusCode);
    }
    if (loadNotFoundPage) {
      return renderComponent(c, await loadNotFoundPage(), { status: 404, isRsc, payloadExtras: { notFound: true } });
    }
    return c.text('Not Found', 404);
  };

  for (const route of routes) {
    if (isPageRoute(route)) {
      const handler: Handler = (c) =>
        runWithContext(c, async () => {
          try {
            if (!isDev && !cspEnabled && route.render === 'static' && c.req.method === 'GET' && !wantsRsc(parseRenderRequest(c.req.raw))) {
              const html = await readPrerendered(ssgDir, c.req.path);
              // A prerendered page is request-independent by construction, so it is safe to cache
              // publicly; the short max-age matches what `public/` files get.
              if (html !== null) return c.html(html, 200, { 'cache-control': 'public, max-age=300' });
            }
            return await renderPage(c, route);
          } catch (error) {
            if (isControlSignal(error)) return resolveControl(c, error);
            throw error;
          }
        });
      app.get(route.path, handler);
      app.post(route.path, handler);
    } else {
      const endpoint = route as EndpointRoute;
      const loadEndpoint = once(() => endpoint.server());
      const handler: Handler = async (c, next) => {
        const { handler: endpointHandler } = await loadEndpoint();
        return endpointHandler(c, next);
      };
      const method = endpoint.method ?? 'all';
      if (method === 'all') app.all(endpoint.path, handler);
      else app.on(method.toUpperCase(), endpoint.path, handler);
    }
  }

  const publicDir = isDev ? join(rootDir, 'public') : join(rootDir, 'dist', 'public');
  if (existsSync(publicDir)) {
    app.on(['GET', 'HEAD'], '/*', createPublicFallback(publicDir, isDev));
  }

  app.notFound(async (c) => {
    const wantsHtml = c.req.header('accept')?.includes('text/html') ?? false;
    const isRsc = wantsRsc(parseRenderRequest(c.req.raw));
    if (loadNotFoundPage && (wantsHtml || isRsc)) {
      return runWithContext(c, async () => renderComponent(c, await loadNotFoundPage(), { status: 404, isRsc }));
    }
    return c.text('Not Found', 404);
  });

  const loadErrorPage = routeConfig.error ? memoizePage(routeConfig.error, 'the error page') : null;
  app.onError(async (error, c) => {
    if (isControlSignal(error)) return runWithContext(c, () => resolveControl(c, error));
    console.error('[rshono] request error:', error);
    const wantsHtml = c.req.header('accept')?.includes('text/html') ?? false;
    const isRsc = wantsRsc(parseRenderRequest(c.req.raw));
    if (loadErrorPage && (wantsHtml || isRsc)) {
      const errorInfo: ErrorInfo = isDev
        ? {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          }
        : { message: 'Internal Server Error' };
      try {
        return await runWithContext(c, async () =>
          renderComponent(c, await loadErrorPage(), {
            status: 500,
            isRsc,
            extraProps: { error: errorInfo },
          }),
        );
      } catch (renderError) {
        console.error('[rshono] the error page failed to render:', renderError);
      }
    }
    const detail = isDev ? `\n\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}` : '';
    return c.text(`Internal Server Error${detail}`, 500);
  });

  return app;
}

export const app = buildApp();

if (!process.env.RSC_HONO_PRERENDER) {
  const devWorker = workerData as { port?: number; hostname?: string } | null;
  // PORT / HOST stay env-overridable (the standard deployment convention); their defaults come
  // from rshono.config.ts, baked into CONFIG. `?? ` (not `||`) so an explicit PORT=0 is honoured.
  const envPort = process.env.PORT !== undefined ? Number(process.env.PORT) : undefined;
  const port = devWorker?.port ?? envPort ?? CONFIG.port ?? 3000;
  const hostname = devWorker?.hostname ?? process.env.HOST ?? CONFIG.host ?? '0.0.0.0';

  const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
    if (parentPort) {
      parentPort.postMessage({ type: 'ready', port: info.port });
    } else {
      console.log(`  ➜ rshono serving on http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${info.port}`);
    }
  });

  onShutdown(() => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
