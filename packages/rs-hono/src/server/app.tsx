/** @jsxRuntime automatic @jsxImportSource react */
/**
 * App Builder
 *
 * Builds the complete Hono application from user routes, optional
 * server sub-app, and framework internals (statics, error pages).
 *
 * This module is runtime-PORTABLE: no Node APIs. The runtime-specific
 * pieces (SSR stream impl, filesystem statics, prerender lookup) are
 * injected via BuildAppOptions — handler.ts composes the Node runtime,
 * the generated `--target edge` entry composes the web runtime.
 *
 * The pragma above pins the JSX transform for this file. It runs under
 * tsx from the USER's project, whose tsconfig doesn't cover framework
 * sources — without it, esbuild falls back to the classic transform
 * and the render crashes with "React is not defined".
 */
import { Hono, type Context, type Handler, type MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';
import type { ComponentType } from 'react';
import { getAssets } from '../assets.js';
import { isPageRoute, type EndpointRoute, type PageRoute, type PageServerModule, type Route } from '../router.js';
import { reloadEndpoint, reloadScript } from './dev-reload.js';
import type { RenderStream } from './render.js';

// ─── Reserved route prefixes ──────────────────────────────────────────────
// User routes must not start with these — they're owned by the framework.

const RESERVED_PREFIXES = ['/_static', '/_rs-hono'];

function checkCollisions(routes: Route[]): void {
    for (const route of routes) {
        for (const prefix of RESERVED_PREFIXES) {
            if (route.path === prefix || route.path.startsWith(prefix + '/')) {
                console.warn(
                    `  ⚠ Route "${route.path}" collides with internal prefix "${prefix}". ` +
                        "The framework's routes are registered first, so this route will never match.",
                );
            }
        }
    }
}

// ─── HTML / script escaping ───────────────────────────────────────────────

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * JSON that is safe to embed inside a <script> tag: "<" is escaped so
 * data containing "</script>" cannot break out of the tag.
 */
function toInlineJson(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function errorPage(title: string, err: unknown, isDev: boolean): string {
    const detail = isDev
        ? `<pre>${escapeHtml(err instanceof Error ? (err.stack ?? err.message) : String(err))}</pre>`
        : '<p>Something went wrong. Check the server logs for details.</p>';
    // In dev, error pages also live-reload — fixing the file heals the page.
    return `<!DOCTYPE html>
<html><head><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui;max-width:600px;margin:4rem auto;padding:0 1rem;">
<h1>${escapeHtml(title)}</h1>${detail}${isDev ? `<script>${reloadScript()}</script>` : ''}</body></html>`;
}

// ─── Build App ────────────────────────────────────────────────────────────

export interface BuildAppOptions {
    /** The route definitions from defineRoutes() */
    routes: Route[];
    /** Optional Hono sub-app for API / middleware (e.g. from src/server.ts) */
    subApp?: Hono;
    /** Whether running in dev mode */
    isDev: boolean;
    /** Global middleware (from rs-hono.config.ts), applied before all routes */
    middleware?: MiddlewareHandler;
    /**
     * Streaming SSR implementation — ssr.ts (Node) or ssr-web.ts (edge).
     * This and the two optional capabilities below are the only
     * runtime-specific pieces; everything else in here is portable.
     */
    render: RenderStream;
    /**
     * Serves /_static/*. Omitted in edge bundles, where the platform CDN
     * owns static files and requests for them never reach the app.
     */
    staticApp?: Hono;
    /**
     * Lookup for build-time prerendered HTML (SSG). Omitted in dev and
     * in edge bundles (the platform serves prerendered pages directly);
     * static routes then render per request.
     */
    readPrerendered?: (requestPath: string) => Promise<string | null>;
}

/**
 * Build the complete Hono application.
 *
 * Hono matches routes in registration order — FIRST registration wins.
 * Mount order:
 *  1. Framework internals — reserved prefixes (/_static, /_rs-hono)
 *  2. Endpoint routes (from routes.ts)
 *  3. Page routes (SSR)
 *  4. User sub-app (src/server.ts) — matches whatever is left
 *  5. Error handler & 404
 */
export function buildApp(options: BuildAppOptions): Hono {
    const { routes, subApp, isDev, middleware, render, staticApp, readPrerendered } = options;

    checkCollisions(routes);

    const pageRoutes = routes.filter(isPageRoute);
    const endpointRoutes = routes.filter((r): r is EndpointRoute => r.kind === 'endpoint');

    // ── 1. Framework internals ──────────────────────────────────────────

    const internalApp = new Hono();

    if (staticApp) {
        internalApp.route('/_static', staticApp);
    }

    internalApp.get('/_rs-hono/health', (c) => c.json({ status: 'ok' }));

    if (isDev) {
        internalApp.get('/_rs-hono/reload', reloadEndpoint);
    }

    // ── Assemble (first match wins) ─────────────────────────────────────

    const app = new Hono();

    if (isDev) {
        app.use('*', async (c, next) => {
            const start = Date.now();
            await next();
            console.log(`  ${c.req.method} ${c.req.path} → ${c.res.status} (${Date.now() - start}ms)`);
        });
    }

    // Hono runs middleware only for handlers registered after it, so the
    // user's global middleware must be registered before any route.
    if (middleware) {
        app.use('*', middleware);
    }

    app.route('/', internalApp);
    app.route('/', createEndpointApp(endpointRoutes));
    app.route('/', createPageApp(pageRoutes, isDev, render, readPrerendered));
    if (subApp) {
        app.route('/', subApp);
    }

    // ── Error handling ──────────────────────────────────────────────────

    app.onError((err, c) => {
        console.error(`[rs-hono] Server error on ${c.req.method} ${c.req.path}:`, err);
        return c.html(errorPage('500 — Internal Server Error', err, isDev), 500);
    });

    app.notFound((c) => {
        return c.html(
            `<!DOCTYPE html>
<html><head><title>404 — Not Found</title></head>
<body style="font-family:system-ui;max-width:600px;margin:4rem auto;padding:0 1rem;">
<h1>404 — Page Not Found</h1>
<p>The page <code>${escapeHtml(c.req.path)}</code> does not exist.</p>
<p><a href="/">← Back home</a></p>${isDev ? `<script>${reloadScript()}</script>` : ''}</body></html>`,
            404,
        );
    });

    // No logging here on purpose: buildApp runs at module evaluation in
    // edge bundles — every isolate cold start would print it. The Node
    // compositions (createAppHandler) log the mount summary instead.

    return app;
}

// ─── Server-module resolution ─────────────────────────────────────────────

/** Memoize a route's server-module thunk so the import runs once. */
function memoize<T>(fn: () => Promise<T>): () => Promise<T> {
    let promise: Promise<T> | undefined;
    return () => (promise ??= fn());
}

// ─── Page App ─────────────────────────────────────────────────────────────

function createPageApp(routes: PageRoute[], isDev: boolean, render: RenderStream, readPrerendered?: (requestPath: string) => Promise<string | null>): Hono {
    const app = new Hono();

    for (const route of routes) {
        const loadServerModule =
            route.server &&
            memoize(async () => {
                const mod = await route.server!();
                // Belt-and-braces for the compile-time ValidateRoute check.
                if (isDev && mod.loader?.path && mod.loader.path !== route.path) {
                    console.warn(`  ⚠ Route "${route.path}" resolves a loader declared for "${mod.loader.path}" — params will not match.`);
                }
                return mod;
            });

        // Warn once per route (not per request) when a page forgets to
        // render a full document.
        let warnedMissingDocument = false;

        const renderPage = async (c: Context) => {
            // The component import is independent of the loader — start it
            // now so the two run concurrently; it is awaited after the
            // loader below. When the loader short-circuits (Response or
            // error) nobody awaits it, so park the rejection on a no-op
            // catch instead of crashing the process. The original promise
            // stays awaitable and its error is handled where it is used.
            const componentPromise = route.component();
            componentPromise.catch(() => {});

            // Resolve the co-located *.server module (loader/staticPaths).
            let serverModule: PageServerModule | undefined;
            if (loadServerModule) {
                try {
                    serverModule = await loadServerModule();
                } catch (err) {
                    console.error(`[rs-hono] Server-module import error for ${route.path}:`, err);
                    return c.html(errorPage('500 — Import Error', err, isDev), 500);
                }
            }

            // Run loader if defined. A loader may return a Response to
            // short-circuit rendering (404, redirect, ...).
            let loaderData: Record<string, unknown> = {};
            if (serverModule?.loader) {
                try {
                    const result = await serverModule.loader(c);
                    if (result instanceof Response) return result;
                    loaderData = result as Record<string, unknown>;
                } catch (err) {
                    console.error(`[rs-hono] Loader error for ${route.path}:`, err);
                    return c.html(errorPage('500 — Loader Error', err, isDev), 500);
                }
            }

            const props: Record<string, unknown> = {
                ...loaderData,
                params: c.req.param() as Record<string, string>,
                url: c.req.url,
            };

            // Import the page component (started before the loader ran)
            let Component: ComponentType<any>;
            try {
                const mod = await componentPromise;
                Component = mod.default;
            } catch (err) {
                console.error(`[rs-hono] Import error for ${route.path}:`, err);
                return c.html(errorPage('500 — Import Error', err, isDev), 500);
            }

            // Hydration payload: the matched route pattern + props. The client
            // entry looks the pattern up in routes.ts — no client-side matcher.
            let bootstrapScript: string;
            try {
                bootstrapScript = `window.__RSH = ${toInlineJson({
                    route: routePath(c),
                    props,
                    // The client re-renders <Assets/> during hydration, so it
                    // needs the same asset list the server rendered with.
                    assets: getAssets(),
                })};`;
            } catch (err) {
                console.error(`[rs-hono] Loader data for ${route.path} is not JSON-serializable:`, err);
                return c.html(errorPage('500 — Serialization Error', err, isDev), 500);
            }
            if (isDev) bootstrapScript += reloadScript();

            // The page owns the full document: its tree (usually via a
            // layout component) renders <html>/<head>/<body>. React emits
            // <!DOCTYPE html> automatically when it renders <html> and
            // appends the bootstrap script + client entry to <body>.
            const element = <Component {...(props as any)} />;

            try {
                const stream = await render({
                    element,
                    bootstrapScript,
                    // The (content-hashed in prod) entry scripts, from the
                    // same registry the CSS links come from. Empty before
                    // the first dev compile — live reload heals that page.
                    bootstrapModules: getAssets().js,
                    onError(err) {
                        console.error(`[rs-hono] SSR stream error for ${route.path}:`, err);
                    },
                    onMissingDocument() {
                        if (warnedMissingDocument) return;
                        warnedMissingDocument = true;
                        console.warn(
                            `  ⚠ Page "${route.path}" did not render <html> — the response is not a complete document. ` +
                                'Wrap the page in a layout that renders <html>/<head>/<body>.',
                        );
                    },
                });

                return new Response(stream, {
                    status: 200,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                });
            } catch (err) {
                // Shell failed to render — this is a real 500.
                console.error(`[rs-hono] Render error for ${route.path}:`, err);
                return c.html(errorPage('500 — Render Error', err, isDev), 500);
            }
        };

        // Prerendered static pages are looked up per request — no
        // per-page route registration, no HTML held in memory. Anything
        // not prerendered (params without staticPaths, build-time skips,
        // content added since the build) falls back to live SSR.
        if (readPrerendered && route.kind === 'static') {
            app.get(route.path, async (c) => {
                const html = await readPrerendered(c.req.path);
                return html !== null ? c.html(html) : renderPage(c);
            });
        } else {
            app.get(route.path, renderPage);
        }
    }

    if (!isDev) {
        // Pre-warm the ESM module cache so first requests don't pay for
        // the page import. Failures are ignored on purpose — they
        // resurface as proper error pages at request time.
        for (const route of routes) {
            route.component().catch(() => {});
        }
    }

    return app;
}

// ─── Endpoint App ─────────────────────────────────────────────────────────

function createEndpointApp(routes: EndpointRoute[]): Hono {
    const app = new Hono();

    for (const route of routes) {
        const loadServerModule = memoize(route.server);
        // Handlers live in *.server modules; resolve lazily so import
        // errors surface as request errors, not startup crashes. A throw
        // here is caught by the app-level onError handler.
        const handler: Handler = async (c, next) => {
            const mod = await loadServerModule();
            if (typeof mod.handler !== 'function') {
                throw new Error(`Endpoint "${route.path}": its server module does not export a "handler" function.`);
            }
            return mod.handler(c, next);
        };

        const method = route.method ?? 'all';
        if (method === 'all') {
            app.all(route.path, handler);
        } else {
            app.on(method.toUpperCase(), route.path, handler);
        }
    }

    return app;
}
