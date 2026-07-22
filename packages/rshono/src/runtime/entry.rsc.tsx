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
import { readPrerendered } from '../server/ssg.js';
import { createPublicFallback, createStaticMiddleware } from '../server/static.js';
import { type ControlSignal, isControlSignal, RedirectSignal } from './control.js';
import { publicUrl, runWithContext } from './context.js';
import { renderHTML } from './entry.ssr.js';
import { parseRenderRequest } from './request.js';

const isDev = process.env.NODE_ENV === 'development';
const rootDir = join(import.meta.dirname, '..', '..');

const serverApp = ((serverAppModule as { default?: unknown }).default ?? null) as Hono | null;

const RENDER_TIMEOUT_MS = Number(process.env.RSC_HONO_RENDER_TIMEOUT_MS || 10_000);

const cspEnabled = !!process.env.RSC_HONO_CSP;

loadEnvFiles(rootDir);

const routeConfig = userRoutes as RouteConfig;
export const routes: readonly Route[] = routeConfig.routes;

export type RscPayload = {
  root: React.ReactNode;
  returnValue?: { ok: boolean; data: unknown };
  formState?: ReactFormState;
  redirect?: string;
  notFound?: boolean;
};

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
  status?: number;
  isRsc: boolean;
  formState?: ReactFormState;
  returnValue?: RscPayload['returnValue'];
  temporaryReferences?: TemporaryReferenceSet;
  extraProps?: Record<string, unknown>;
  payloadExtras?: Pick<RscPayload, 'redirect' | 'notFound'>;
}

async function renderComponent(c: Context, Page: ServerEntry<PageComponent>, opts: ComponentRenderOptions): Promise<Response> {
  const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(RENDER_TIMEOUT_MS)]);
  const nonce = cspEnabled && !opts.isRsc ? crypto.randomUUID() : undefined;
  let params: Record<string, string> = {};
  try {
    params = c.req.param();
  } catch {}
  const props = { params, url: publicUrl(c).toString(), ...opts.extraProps };
  const root = (
    <>
      {}
      {nonce && <meta property="csp-nonce" nonce={nonce} />}
      {Page.entryCssFiles?.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}
      <Page {...props} />
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
    return c.body(rscStream, (opts.status ?? 200) as ContentfulStatusCode, {
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
    if (controlSignal) throw controlSignal;
    throw error;
  }
  if (controlSignal) throw controlSignal;
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
  return c.body(ssrResult.stream, (ssrResult.status ?? opts.status ?? 200) as ContentfulStatusCode, headers);
}

async function renderPage(c: Context, route: PageRoute): Promise<Response> {
  const request = c.req.raw;
  const renderRequest = parseRenderRequest(request);

  let returnValue: RscPayload['returnValue'];
  let formState: ReactFormState | undefined;
  let temporaryReferences: TemporaryReferenceSet | undefined;
  let actionStatus: number | undefined;
  if (renderRequest.isAction) {
    if (!isSameOriginAction(request)) {
      return c.text('Forbidden: cross-origin server action rejected', 403);
    }
    if (renderRequest.actionId) {
      const contentType = request.headers.get('content-type');
      const body = contentType?.startsWith('multipart/form-data') ? await request.formData() : await request.text();
      temporaryReferences = createTemporaryReferenceSet();
      const args = await decodeReply<unknown[]>(body, { temporaryReferences });
      const action = loadServerAction(renderRequest.actionId);
      try {
        returnValue = { ok: true, data: await action.apply(null, args) };
      } catch (error) {
        if (isControlSignal(error)) throw error;
        returnValue = { ok: false, data: error };
        actionStatus = 500;
      }
    } else {
      const formData = await request.formData();
      const decodedAction = await decodeAction(formData, __rspack_rsc_manifest__.serverManifest);
      if (decodedAction) {
        try {
          const result = await decodedAction();
          formState = (await decodeFormState(result, formData, __rspack_rsc_manifest__.serverManifest)) ?? undefined;
        } catch (error) {
          if (isControlSignal(error)) throw error;
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

  const memoizePage = (page: SpecialPage, label: string) => {
    let promise: Promise<ServerEntry<PageComponent>> | undefined;
    return () => (promise ??= loadPageModule(page.component, label));
  };
  const loadNotFoundPage = routeConfig.notFound ? memoizePage(routeConfig.notFound, 'the notFound page') : null;

  const resolveControl = async (c: Context, signal: ControlSignal): Promise<Response> => {
    const { isRsc } = parseRenderRequest(c.req.raw);
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
            if (!isDev && !cspEnabled && route.kind === 'static' && c.req.method === 'GET' && !parseRenderRequest(c.req.raw).isRsc) {
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

  const publicDir = isDev ? join(rootDir, 'public') : join(rootDir, 'dist', 'public');
  if (existsSync(publicDir)) {
    app.on(['GET', 'HEAD'], '/*', createPublicFallback(publicDir, isDev));
  }

  app.notFound(async (c) => {
    const wantsHtml = c.req.header('accept')?.includes('text/html') ?? false;
    const { isRsc } = parseRenderRequest(c.req.raw);
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
    if (loadErrorPage && wantsHtml) {
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
            isRsc: false,
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
  const port = devWorker?.port ?? Number(process.env.PORT || 3000);
  const hostname = devWorker?.hostname ?? process.env.HOST ?? '0.0.0.0';

  const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
    if (parentPort) {
      parentPort.postMessage({ type: 'ready', port: info.port });
    } else {
      console.log(`  ➜ rshono serving on http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${info.port}`);
    }
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    });
  }
}
