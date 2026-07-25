import { serve } from '@hono/node-server';
import type { Context, Handler } from 'hono';
import { Hono } from 'hono';
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
const MAX_BODY_BYTES = CONFIG.maxBodyBytes; // action-POST body cap in bytes; 0 disables it.

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

function isSameOriginAction(request: Request): boolean {
  if (!checkOrigin) return true;

  const origin = request.headers.get('origin');
  const originHost = origin ? (URL.parse(origin)?.host ?? null) : null;
  if (origin !== null && originHost === null) return false; // an Origin header we can't parse is untrusted.

  // The Origin is trusted when it matches our own host or was explicitly allowlisted.
  const trusted =
    originHost !== null &&
    (originHost === request.headers.get('x-forwarded-host') ||
      originHost === request.headers.get('host') ||
      allowedOrigins.has(originHost));

  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    // The browser tells us (unforgeably) this didn't originate from our own site — only a
    // trusted (allowlisted) Origin may proceed.
    return trusted;
  }

  // No Origin header — common for no-JS form posts — is treated as same-origin.
  if (originHost === null) return true;
  return trusted;
}

/** Thrown when an action POST body exceeds {@link MAX_BODY_BYTES}. Caught in `renderPage` and turned into a 413. */
class BodyTooLargeError extends Error {}

/**
 * Guards an action POST against a memory-exhaustion (oversized body) attack. Rejects up front on a
 * `Content-Length` over the cap, and — because that header can be absent (chunked) or lie about the
 * real size — also wraps the body stream in a byte counter that aborts the read once the cap is
 * exceeded. The stream error surfaces from `request.formData()` / `request.text()` as a
 * {@link BodyTooLargeError}. Returns the request untouched when the cap is disabled (`MAX_BODY_BYTES <= 0`).
 */
function enforceBodyLimit(request: Request): Request {
  if (!(MAX_BODY_BYTES > 0)) return request;
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new BodyTooLargeError();
  const body = request.body;
  if (!body) return request;
  let seen = 0;
  const limited = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > MAX_BODY_BYTES) controller.error(new BodyTooLargeError());
        else controller.enqueue(chunk);
      },
    }),
  );
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: limited,
    // Node requires `duplex` when a request carries a streaming body; not yet in the DOM lib types.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
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
}

interface RenderDeadline {
  /** The request signal combined with the timeout — pass to the RSC/SSR renderers. */
  readonly signal: AbortSignal;
  /** Releases the timer now — call on an error path where nothing will stream. */
  clear(): void;
  /** Wraps a response stream so the timer is released once its last byte flushes. */
  guard(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array>;
}

/**
 * Owns the render-deadline lifecycle in one place (the RAII / `defer` pattern — a
 * `using` declaration doesn't fit because the timer must outlive this call to keep
 * guarding the *stream*, not just the function scope). The timer is released on
 * exactly one of: the stream finishing ({@link RenderDeadline.guard}), an explicit
 * {@link RenderDeadline.clear} on an error path, or the signal aborting (client
 * disconnect, or the deadline firing itself). A manually-cleared timer instead of
 * `AbortSignal.timeout()` so a fast response doesn't leave one pending to fire later.
 */
function createRenderDeadline(requestSignal: AbortSignal, ms: number): RenderDeadline {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`[rshono] render exceeded ${ms}ms`)), ms);
  timer.unref?.();
  const signal = AbortSignal.any([requestSignal, controller.signal]);
  const clear = () => clearTimeout(timer);
  signal.addEventListener('abort', clear, { once: true });
  return {
    signal,
    clear,
    guard: (stream) => stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ flush: clear })),
  };
}

async function renderComponent(c: Context, Page: ServerEntry<PageComponent>, opts: ComponentRenderOptions): Promise<Response> {
  const deadline = createRenderDeadline(c.req.raw.signal, RENDER_TIMEOUT_MS);
  const signal = deadline.signal;

  const nonce = cspEnabled && !opts.isRsc ? crypto.randomUUID() : undefined;
  const params = readParams(c);
  const props = { params, url: publicUrl(c).toString(), ...opts.extraProps };
  const root = (
    <>
      {}
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
    headers['content-security-policy'] = [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''}`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data:`,
      `connect-src 'self'`,
    ].join('; ');
  }
  return c.body(deadline.guard(ssrResult.stream), (ssrResult.status ?? opts.status ?? 200) as ContentfulStatusCode, headers);
}

async function renderPage(c: Context, route: PageRoute): Promise<Response> {
  const request = c.req.raw;
  const renderRequest = parseRenderRequest(request);

  let returnValue: ActionResult | undefined;
  let formState: ReactFormState | undefined;
  let temporaryReferences: TemporaryReferenceSet | undefined;
  let actionStatus: number | undefined;
  if (isActionRequest(renderRequest)) {
    if (!isSameOriginAction(request)) {
      return c.text('Forbidden: cross-origin server action rejected', 403);
    }
    try {
      const limited = enforceBodyLimit(request);
      if (renderRequest.kind === 'rsc-action') {
        const contentType = request.headers.get('content-type');
        const body = contentType?.startsWith('multipart/form-data') ? await limited.formData() : await limited.text();
        temporaryReferences = createTemporaryReferenceSet();
        const args = await decodeReply<unknown[]>(body, { temporaryReferences });
        const action = loadServerAction(renderRequest.actionId);
        try {
          returnValue = { ok: true, value: await action.apply(null, args) };
        } catch (error) {
          if (isControlSignal(error)) throw error;
          returnValue = { ok: false, error };
          actionStatus = 500;
        }
      } else {
        const formData = await limited.formData();
        const decodedAction = await decodeAction(formData, __rspack_rsc_manifest__.serverManifest);
        if (decodedAction) {
          const result = await decodedAction();
          formState = (await decodeFormState(result, formData, __rspack_rsc_manifest__.serverManifest)) ?? undefined;
        }
      }
    } catch (error) {
      if (error instanceof BodyTooLargeError) return c.text('Payload Too Large', 413);
      throw error;
    }
  }

  const Page = await loadPage(route);
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

  app.route(
    '/_static',
    createStaticMiddleware({
      roots: [join(rootDir, 'dist', 'static')],
      isDev,
    }),
  );

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
        c.header('x-rshono-redirect', signal.location);
        return c.body(renderToReadableStream({ root: null, redirect: signal.location } satisfies RscPayload), 200, {
          'content-type': 'text/x-component;charset=utf-8',
        });
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
              if (html !== null) return c.html(html);
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
