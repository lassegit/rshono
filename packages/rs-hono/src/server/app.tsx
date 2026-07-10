/** @jsxRuntime automatic @jsxImportSource react */
/**
 * App Builder
 *
 * Builds the complete Hono application from user routes, optional
 * server sub-app, and framework internals (static files, error pages).
 *
 * The pragma above pins the JSX transform for this file. It runs under
 * tsx from the USER's project, whose tsconfig doesn't cover framework
 * sources — without it, esbuild falls back to the classic transform
 * and the render crashes with "React is not defined".
 */
import { Hono, type Context, type Handler } from 'hono';
import { routePath } from 'hono/route';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentType } from 'react';
import { getAssets } from '../assets.js';
import { isPageRoute, type EndpointRoute, type PageRoute, type PageServerModule, type Route } from '../router.js';
import { reloadEndpoint, reloadScript } from './dev-reload.js';
import { readPrerendered } from './ssg.js';
import { renderToStream } from './ssr.js';
import { createStaticMiddleware } from './static.js';

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
    /** Root directory of the user's project */
    rootDir: string;
    /** Public/static directory name */
    publicDir: string;
    /** Output directory name (client bundle lives in <outDir>/client) */
    outDir: string;
    /** Whether running in dev mode */
    isDev: boolean;
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
    const { routes, subApp, rootDir, publicDir, outDir, isDev } = options;

    checkCollisions(routes);

    const pageRoutes = routes.filter(isPageRoute);
    const endpointRoutes = routes.filter((r): r is EndpointRoute => r.kind === 'endpoint');

    // ── 1. Framework internals ──────────────────────────────────────────

    const internalApp = new Hono();

    // The client bundle is written to <outDir>/client (chunks/, assets/).
    // In dev, the public dir is served as-is alongside it; in prod, the
    // build copies public/ into <outDir>/client so one root suffices.
    const clientOut = join(rootDir, outDir, 'client');
    if (isDev) {
        // The Rspack watcher may not have produced the first bundle yet.
        mkdirSync(clientOut, { recursive: true });
    }
    const staticRoots = (isDev ? [join(rootDir, publicDir), clientOut] : [clientOut])
        // A project without a public/ dir is fine — don't serve (or warn
        // about) roots that don't exist.
        .filter((root) => existsSync(root));

    internalApp.route('/_static', createStaticMiddleware({ roots: staticRoots, isDev }));

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

    app.route('/', internalApp);
    app.route('/', createEndpointApp(endpointRoutes));
    // In prod, static routes prerendered by `rs-hono build` are served
    // from <outDir>/ssg; anything else falls back to per-request SSR.
    app.route('/', createPageApp(pageRoutes, isDev, isDev ? undefined : join(rootDir, outDir, 'ssg')));
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

    console.log('  • Routes mounted:');
    console.log(`    - ${pageRoutes.length} pages`);
    console.log(`    - ${endpointRoutes.length} endpoints`);
    if (subApp) console.log('    - 1 server sub-app');

    return app;
}

// ─── Server-module resolution ─────────────────────────────────────────────

/** Memoize a route's server-module thunk so the import runs once. */
function memoize<T>(fn: () => Promise<T>): () => Promise<T> {
    let promise: Promise<T> | undefined;
    return () => (promise ??= fn());
}

// ─── Page App ─────────────────────────────────────────────────────────────

function createPageApp(routes: PageRoute[], isDev: boolean, ssgDir?: string): Hono {
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

        const render = async (c: Context) => {
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

            // Import the page component
            let Component: ComponentType<any>;
            try {
                const mod = await route.component();
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
                const stream = await renderToStream({
                    element,
                    bootstrapScript,
                    clientEntry: '/_static/chunks/main.js',
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
        if (ssgDir && route.kind === 'static') {
            app.get(route.path, async (c) => {
                const html = await readPrerendered(ssgDir, c.req.path);
                return html !== null ? c.html(html) : render(c);
            });
        } else {
            app.get(route.path, render);
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
