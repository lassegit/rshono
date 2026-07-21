/**
 * RSC entry — the app server. This module is the server bundle's entry
 * point and lives in the 'react-server-components' layer, so React
 * resolves with the react-server condition: components render to flight
 * payloads, 'use client' imports become client references, and
 * 'use server' modules register server actions.
 *
 * It assembles the Hono app from the user's routes.ts (aliased in as
 * '@rshono/routes') and optional index.server.ts sub-app
 * ('@rshono/server-app'), in this order (first match wins):
 *
 *   /_static/*  → static files (client bundle + public/)
 *   sub-app     → the user's Hono app, mounted at / — mounted ahead of
 *                 routes.ts so `server.use(...)` middleware there wraps
 *                 every request below it (routes.ts pages/endpoints
 *                 included), Next.js-middleware style. A terminal route
 *                 registered in the sub-app therefore also takes
 *                 precedence over a routes.ts entry at the same path —
 *                 don't define the same path in both places.
 *   endpoints   → routes.ts `kind: 'endpoint'` handlers
 *   pages       → GET renders; POST runs a server action, then renders
 *
 * Boot: unless RSC_HONO_PRERENDER is set (build-time SSG imports the
 * app without starting a listener), serve() on PORT — or, in dev, on
 * the ephemeral port passed via workerData, reported back to the CLI
 * with a 'ready' message.
 */
import { serve } from '@hono/node-server';
import type { Context, Handler } from 'hono';
import { Hono } from 'hono';
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
// @ts-expect-error — resolved by the '@rshono/server-app' alias (index.server.ts or the empty fallback)
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
import { readPrerendered } from '../server/ssg.js';
import { createStaticMiddleware } from '../server/static.js';
import { renderHTML } from './entry.ssr.js';
import { parseRenderRequest } from './request.js';

const isDev = process.env.NODE_ENV === 'development';
/** dist/server/main.mjs → the app root is two levels up. */
const rootDir = join(import.meta.dirname, '..', '..');

const serverApp = ((serverAppModule as { default?: unknown }).default ?? null) as Hono | null;

/**
 * Hard ceiling on a single page render (flight + SSR), so a hung data
 * fetch or unresolved Suspense promise can't hold sockets open forever.
 */
const RENDER_TIMEOUT_MS = Number(process.env.RSC_HONO_RENDER_TIMEOUT_MS || 10_000);

/**
 * Opt-in strict Content-Security-Policy: set RSC_HONO_CSP=1 to send a
 * per-request-nonce CSP header with every rendered HTML document.
 * Prerendered (SSG) pages are skipped while enabled — static HTML can't
 * carry a per-request nonce — those routes fall back to per-request SSR.
 */
const cspEnabled = !!process.env.RSC_HONO_CSP;

// Covers env reads at request time even when the bundle is started with
// plain `node dist/server/main.mjs`. (Module-top-level env reads in user
// code run before this — start via `rshono start`, which loads .env
// before Node does, if you need those.)
loadEnvFiles(rootDir);

const routeConfig = userRoutes as RouteConfig;
/** The route table (consumed by the SSG build step too). */
export const routes: readonly Route[] = routeConfig.routes;

/**
 * The schema serialized into the flight stream and deserialized by the
 * SSR layer and the browser.
 */
export type RscPayload = {
  /** The page's element tree (per-page CSS links + the component). */
  root: React.ReactNode;
  /** Return value of a client-initiated server action call. */
  returnValue?: { ok: boolean; data: unknown };
  /** useActionState state of a progressive-enhancement form POST. */
  formState?: ReactFormState;
};

// ─── CSRF ─────────────────────────────────────────────────────────────────

/**
 * Same-origin check for server-action POSTs.
 *
 * Browsers attach an Origin header to every POST; a cross-site form (or
 * fetch) therefore always reveals itself, and a mismatch is rejected.
 * The header cannot be forged from a victim's browser — only from
 * custom clients (curl, server-to-server), which either omit it
 * (allowed: no ambient cookies, not a CSRF vector) or control it
 * outright anyway. x-forwarded-host covers reverse-proxy deployments
 * where Host is the internal address; a real cross-site attacker can't
 * set that header from a browser either.
 */
function isSameOriginAction(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return originHost === request.headers.get('x-forwarded-host') || originHost === request.headers.get('host');
}

// ─── Page rendering ───────────────────────────────────────────────────────

/**
 * The request URL as the browser sees it, for `props.url`.
 *
 * In dev the app runs behind a proxy on an ephemeral worker port, so
 * `c.req.url` reports the internal `127.0.0.1:<port>` origin. The proxy
 * forwards the real host/proto in x-forwarded-* headers (as reverse
 * proxies do in production too), so we rebuild the origin from those
 * when present. With no forwarded headers (SSG build, direct hits) we
 * fall back to `c.req.url` unchanged.
 */
function publicUrl(c: Context): string {
  const forwardedHost = c.req.header('x-forwarded-host');
  if (!forwardedHost) return c.req.url;
  const url = new URL(c.req.url);
  url.host = forwardedHost;
  const forwardedProto = c.req.header('x-forwarded-proto');
  if (forwardedProto) url.protocol = forwardedProto;
  return url.toString();
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

interface ComponentRenderOptions {
  /** Response status (SSR shell failure still overrides with 500). */
  status?: number;
  /** Respond with a flight payload instead of HTML. */
  isRsc: boolean;
  formState?: ReactFormState;
  returnValue?: RscPayload['returnValue'];
  temporaryReferences?: TemporaryReferenceSet;
  /** Merged into the page props (e.g. the error page's `error`). */
  extraProps?: Record<string, unknown>;
}

/**
 * The core RSC pipeline for one component: flight stream (+ SSR to HTML
 * unless the request wants the payload), with timeout/disconnect abort,
 * per-page CSS, and opt-in CSP. Shared by routed pages and the special
 * 404/500 pages.
 */
async function renderComponent(c: Context, Page: ServerEntry<PageComponent>, opts: ComponentRenderOptions): Promise<Response> {
  // One deadline for the whole render; also aborts when the client
  // disconnects mid-stream.
  const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(RENDER_TIMEOUT_MS)]);
  const nonce = cspEnabled && !opts.isRsc ? crypto.randomUUID() : undefined;
  // Inside notFound/onError handlers no route matched, and Hono's
  // param() throws rather than returning {}.
  let params: Record<string, string> = {};
  try {
    params = c.req.param();
  } catch {
    // no matched route — special pages get empty params
  }
  const props = { params, url: publicUrl(c), ...opts.extraProps };
  const root = (
    <>
      {/* React reads this meta for nonces on dynamically inserted
                scripts/styles; entry.client mirrors it into
                __webpack_nonce__ for chunk loading. */}
      {nonce && <meta property="csp-nonce" nonce={nonce} />}
      {Page.entryCssFiles?.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}
      <Page {...props} />
    </>
  );

  const rscPayload: RscPayload = { root, formState: opts.formState, returnValue: opts.returnValue };
  const rscStream = renderToReadableStream(rscPayload, {
    temporaryReferences: opts.temporaryReferences,
    signal,
    onError(error) {
      if (!signal.aborted) console.error('[rshono] render error:', error);
    },
  });

  if (opts.isRsc) {
    return new Response(rscStream, {
      status: opts.status,
      headers: { 'content-type': 'text/x-component;charset=utf-8' },
    });
  }

  const ssrResult = await renderHTML(rscStream, {
    bootstrapScripts: Page.entryJsFiles,
    formState: opts.formState,
    signal,
    nonce,
  });
  const headers = new Headers({ 'content-type': 'text/html;charset=utf-8' });
  if (nonce) {
    headers.set(
      'content-security-policy',
      [
        `default-src 'self'`,
        // unsafe-eval only in dev: React's findSourceMapURL uses eval
        `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''}`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' data:`,
        `connect-src 'self'`,
      ].join('; '),
    );
  }
  return new Response(ssrResult.stream, {
    status: ssrResult.status ?? opts.status,
    headers,
  });
}

async function renderPage(c: Context, route: PageRoute): Promise<Response> {
  const request = c.req.raw;
  const renderRequest = parseRenderRequest(request);

  // Run a server action (if any) BEFORE rendering, so the rendered
  // tree reflects the post-action state.
  let returnValue: RscPayload['returnValue'];
  let formState: ReactFormState | undefined;
  let temporaryReferences: TemporaryReferenceSet | undefined;
  let actionStatus: number | undefined;
  if (renderRequest.isAction) {
    if (!isSameOriginAction(request)) {
      return c.text('Forbidden: cross-origin server action rejected', 403);
    }
    if (renderRequest.actionId) {
      // Called from hydrated client code via setServerCallback.
      const contentType = request.headers.get('content-type');
      const body = contentType?.startsWith('multipart/form-data') ? await request.formData() : await request.text();
      temporaryReferences = createTemporaryReferenceSet();
      const args = await decodeReply<unknown[]>(body, { temporaryReferences });
      const action = loadServerAction(renderRequest.actionId);
      try {
        returnValue = { ok: true, data: await action.apply(null, args) };
      } catch (error) {
        returnValue = { ok: false, data: error };
        actionStatus = 500;
      }
    } else {
      // <form action={serverFn}> submitted before hydration (or with
      // JS disabled) — the action id travels in $ACTION_* form fields.
      const formData = await request.formData();
      const decodedAction = await decodeAction(formData, __rspack_rsc_manifest__.serverManifest);
      if (decodedAction) {
        try {
          const result = await decodedAction();
          formState = (await decodeFormState(result, formData, __rspack_rsc_manifest__.serverManifest)) ?? undefined;
        } catch (error) {
          console.error('[rshono] progressive-enhancement action failed:', error);
          return c.text('Internal Server Error: server action failed', 500);
        }
      }
    }
  }

  const Page = await loadPage(route);
  return renderComponent(c, Page, {
    status: actionStatus,
    isRsc: renderRequest.isRsc,
    formState,
    returnValue,
    temporaryReferences,
  });
}

// ─── App assembly ─────────────────────────────────────────────────────────

function buildApp(): Hono {
  const app = new Hono();

  // Static assets. In dev these are usually answered by the CLI's front
  // server before reaching the worker; in prod this is the only server.
  const publicDir = join(rootDir, 'public');
  app.route(
    '/_static',
    createStaticMiddleware({
      roots: [join(rootDir, 'dist', 'static'), ...(isDev && existsSync(publicDir) ? [publicDir] : [])],
      isDev,
    }),
  );

  // The user's Hono sub-app — full Hono power (any method, streaming,
  // websockets in prod, middleware) at any path not taken by a route.
  // Mounted BEFORE routes.ts's own routes so `server.use(...)`
  // middleware there runs on every request (it calls next() and falls
  // through to the handlers registered below), rather than only on
  // paths the sub-app itself defines.
  if (serverApp) {
    app.route('/', serverApp);
  }

  const ssgDir = join(rootDir, 'dist', 'ssg');

  for (const route of routes) {
    if (isPageRoute(route)) {
      const handler: Handler = async (c) => {
        // Prerendered static pages are served from disk in prod.
        // Flight (soft-nav) requests still render (the files hold
        // HTML, not payloads), and CSP mode disables the shortcut
        // entirely: static files can't carry per-request nonces.
        if (!isDev && !cspEnabled && route.kind === 'static' && c.req.method === 'GET' && !parseRenderRequest(c.req.raw).isRsc) {
          const html = await readPrerendered(ssgDir, c.req.path);
          if (html !== null) return c.html(html);
        }
        return renderPage(c, route);
      };
      app.get(route.path, handler);
      // POST = server action (client call or progressive-enhancement
      // form submit), which re-renders the same page afterwards.
      app.post(route.path, handler);
    } else {
      const endpoint = route as EndpointRoute;
      // The server module loads lazily on first hit, then memoizes.
      let modPromise: ReturnType<EndpointRoute['server']> | undefined;
      const handler: Handler = async (c, next) => {
        modPromise ??= endpoint.server();
        const { handler: endpointHandler } = await modPromise;
        return endpointHandler(c, next);
      };
      const method = endpoint.method ?? 'all';
      if (method === 'all') app.all(endpoint.path, handler);
      else app.on(method.toUpperCase(), endpoint.path, handler);
    }
  }

  // Special pages from routes.ts: real RSC pages, rendered through the
  // same pipeline as routed pages (per-page assets, CSP, timeouts).
  // Non-HTML clients (JSON APIs, curl) keep plain-text responses.
  const memoizePage = (page: SpecialPage, label: string) => {
    let promise: Promise<ServerEntry<PageComponent>> | undefined;
    return () => (promise ??= loadPageModule(page.component, label));
  };

  const loadNotFoundPage = routeConfig.notFound ? memoizePage(routeConfig.notFound, 'the notFound page') : null;
  app.notFound(async (c) => {
    const wantsHtml = c.req.header('accept')?.includes('text/html') ?? false;
    const { isRsc } = parseRenderRequest(c.req.raw);
    if (loadNotFoundPage && (wantsHtml || isRsc)) {
      // isRsc: a soft navigation to a dead link renders the 404
      // page in place, as a flight payload.
      return renderComponent(c, await loadNotFoundPage(), { status: 404, isRsc });
    }
    return c.text('Not Found', 404);
  });

  const loadErrorPage = routeConfig.error ? memoizePage(routeConfig.error, 'the error page') : null;
  app.onError(async (error, c) => {
    console.error('[rshono] request error:', error);
    const wantsHtml = c.req.header('accept')?.includes('text/html') ?? false;
    if (loadErrorPage && wantsHtml) {
      // What the error page sees — pre-redacted in production.
      const errorInfo: ErrorInfo = isDev
        ? {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          }
        : { message: 'Internal Server Error' };
      try {
        return await renderComponent(c, await loadErrorPage(), {
          status: 500,
          isRsc: false,
          extraProps: { error: errorInfo },
        });
      } catch (renderError) {
        // The error page itself failed — fall through to plain text.
        console.error('[rshono] the error page failed to render:', renderError);
      }
    }
    const detail = isDev ? `\n\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}` : '';
    return c.text(`Internal Server Error${detail}`, 500);
  });

  return app;
}

export const app = buildApp();

// ─── Boot ─────────────────────────────────────────────────────────────────

if (!process.env.RSC_HONO_PRERENDER) {
  const devWorker = workerData as { port?: number; hostname?: string } | null;
  const port = devWorker?.port ?? Number(process.env.PORT || 3000);
  const hostname = devWorker?.hostname ?? process.env.HOST ?? '0.0.0.0';

  const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
    // Dev: tell the CLI which ephemeral port we got.
    if (parentPort) {
      parentPort.postMessage({ type: 'ready', port: info.port });
    } else {
      console.log(`  ➜ rshono serving on http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${info.port}`);
    }
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      // Open keep-alive sockets shouldn't stall shutdown.
      setTimeout(() => process.exit(0), 3000).unref();
    });
  }
}
