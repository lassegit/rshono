/**
 * Client Entry Point — hydration runtime.
 *
 * The user's routes.ts is aliased to "@rs-hono/routes" by the framework's
 * Rspack config, so it is part of the CLIENT graph: its `import()` calls
 * are what Rspack code-splits into per-page chunks. Server-only modules
 * (*.server.*) are replaced with a throwing stub at bundle time, so
 * loaders/handlers in routes.ts are inert dead code in the browser.
 *
 * The server injects (before this module runs):
 *   window.__RSH = { route: "/profile/:id", props: { ... } }
 *
 * `route` is the registered route pattern that matched on the server, so
 * the client needs no path matcher — an exact string lookup suffices.
 *
 * The page's component tree renders the ENTIRE document — <html>, <head>
 * and <body>, usually via a layout component — so hydration targets
 * `document` itself. This requires React 19, which skips unexpected
 * nodes in <head>/<body> (browser extensions, analytics snippets)
 * instead of failing with a mismatch.
 */
import { hydrateRoot } from 'react-dom/client';
// @ts-expect-error — virtual alias resolved by the framework's Rspack config
import { routes } from '@rs-hono/routes';
import { setAssets, type AssetManifest } from './assets.js';
import { isPageRoute, type Route } from './router.js';

declare global {
    interface Window {
        __RSH?: { route: string; props: Record<string, unknown>; assets?: AssetManifest };
    }
}

async function bootstrap() {
    const data = window.__RSH;
    if (!data) {
        return; // not an rs-hono page (e.g. error page)
    }

    const route = (routes as Route[]).filter(isPageRoute).find((r) => r.path === data.route);
    if (!route) {
        console.error(`[rs-hono] No route found for "${data.route}" — cannot hydrate.`);
        return;
    }

    try {
        const mod = await route.component();
        const Component = mod.default;
        // Populate the registry BEFORE rendering, so the layout's
        // <Assets/> hydrates against the <link> tags the server emitted.
        setAssets(data.assets ?? { css: [] });
        hydrateRoot(document, <Component {...(data.props as any)} />);
        if (process.env.NODE_ENV === 'development') {
            console.log(`[rs-hono] hydrated ${data.route}`);
        }
    } catch (err) {
        console.error(`[rs-hono] Hydration failed for "${data.route}":`, err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
