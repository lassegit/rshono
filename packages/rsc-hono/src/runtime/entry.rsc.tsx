/**
 * RSC entry — the app server. This module is the server bundle's entry
 * point and lives in the 'react-server-components' layer, so React
 * resolves with the react-server condition: components render to flight
 * payloads, 'use client' imports become client references, and
 * 'use server' modules register server actions.
 *
 * It assembles the Hono app from the user's routes.ts (aliased in as
 * '@rsc-hono/routes') and optional index.server.ts sub-app
 * ('@rsc-hono/server-app'), in this order (first match wins):
 *
 *   /_static/*  → static files (client bundle + public/)
 *   endpoints   → routes.ts `kind: 'endpoint'` handlers
 *   pages       → GET renders; POST runs a server action, then renders
 *   sub-app     → the user's Hono app, mounted at /
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
// @ts-expect-error — resolved by the '@rsc-hono/routes' alias to the app's routes.ts
import { routes as userRoutes } from '@rsc-hono/routes';
// @ts-expect-error — resolved by the '@rsc-hono/server-app' alias (index.server.ts or the empty fallback)
import serverApp from '@rsc-hono/server-app';
import { isPageRoute, type EndpointRoute, type PageComponent, type PageRoute, type Route } from '../router.js';
import { loadEnvFiles } from '../server/load-env.js';
import { readPrerendered } from '../server/ssg.js';
import { createStaticMiddleware } from '../server/static.js';
import { renderHTML } from './entry.ssr.js';
import { parseRenderRequest } from './request.js';

const isDev = process.env.NODE_ENV === 'development';
/** dist/server/main.mjs → the app root is two levels up. */
const rootDir = join(import.meta.dirname, '..', '..');

// Covers env reads at request time even when the bundle is started with
// plain `node dist/server/main.mjs`. (Module-top-level env reads in user
// code run before this — start via `rsc-hono start`, which loads .env
// before Node does, if you need those.)
loadEnvFiles(rootDir);

export const routes: readonly Route[] = userRoutes;

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

// ─── Page rendering ───────────────────────────────────────────────────────

async function loadPage(route: PageRoute): Promise<ServerEntry<PageComponent>> {
    const mod = await route.component();
    const Page = mod.default as ServerEntry<PageComponent> | undefined;
    if (typeof Page !== 'function') {
        throw new Error(`[rsc-hono] The page module for "${route.path}" must default-export a server component.`);
    }
    if (!Page.entryJsFiles) {
        throw new Error(
            `[rsc-hono] The page module for "${route.path}" must start with the 'use server-entry' directive ` +
                '(it enables per-page code splitting and asset tracking).',
        );
    }
    return Page;
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
                    console.error('[rsc-hono] progressive-enhancement action failed:', error);
                    return c.text('Internal Server Error: server action failed', 500);
                }
            }
        }
    }

    const Page = await loadPage(route);
    const props = { params: c.req.param(), url: c.req.url };
    const root = (
        <>
            {Page.entryCssFiles?.map((href) => (
                <link key={href} rel="stylesheet" href={href} precedence="default" />
            ))}
            <Page {...props} />
        </>
    );

    const rscPayload: RscPayload = { root, formState, returnValue };
    const rscStream = renderToReadableStream(rscPayload, {
        temporaryReferences,
        onError(error) {
            console.error('[rsc-hono] render error:', error);
        },
    });

    if (renderRequest.isRsc) {
        return new Response(rscStream, {
            status: actionStatus,
            headers: { 'content-type': 'text/x-component;charset=utf-8' },
        });
    }

    const ssrResult = await renderHTML(rscStream, {
        bootstrapScripts: Page.entryJsFiles,
        formState,
    });
    return new Response(ssrResult.stream, {
        status: ssrResult.status ?? actionStatus,
        headers: { 'content-type': 'text/html;charset=utf-8' },
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

    const ssgDir = join(rootDir, 'dist', 'ssg');

    for (const route of routes) {
        if (isPageRoute(route)) {
            const handler: Handler = async (c) => {
                // Prerendered static pages are served from disk in prod.
                // Flight (soft-nav) requests still render: the files hold
                // HTML, not payloads.
                if (!isDev && route.kind === 'static' && c.req.method === 'GET' && !parseRenderRequest(c.req.raw).isRsc) {
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

    // The user's Hono sub-app — full Hono power (any method, streaming,
    // websockets in prod, middleware) at any path not taken by a route.
    if (serverApp) {
        app.route('/', serverApp);
    }

    app.notFound((c) => c.text('Not Found', 404));
    app.onError((error, c) => {
        console.error('[rsc-hono] request error:', error);
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
            console.log(`  ➜ rsc-hono serving on http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${info.port}`);
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
