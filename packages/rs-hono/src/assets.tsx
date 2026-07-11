/** @jsxRuntime automatic @jsxImportSource react */
/**
 * Build-asset registry + <Assets/> component.
 *
 * Rspack merges every imported CSS file (global and *.module.css alike)
 * into a single content-hashed stylesheet. <Assets/> renders the <link>
 * tag(s) for it — place it in your layout's <head>:
 *
 *   <head>
 *     <title>{title}</title>
 *     <Assets />
 *   </head>
 *
 * The registry is process-global, not per-request: the asset list only
 * changes when the client bundle is rebuilt. It is populated by
 * - dev:   the Rspack watcher, after every rebuild
 * - build: from the compiler stats, before SSG pre-rendering
 * - start: from <outDir>/assets.json written by the build
 * - client: from the window.__RSH payload, before hydration — so the
 *   client renders exactly the tags the server did.
 *
 * This module is ISOMORPHIC: it is part of the client bundle (layouts
 * import <Assets/>), so it must not touch Node APIs.
 */
import type { ReactElement } from 'react';

export interface AssetManifest {
    /** Stylesheet hrefs, e.g. "/_static/chunks/styles.<hash>.css". */
    css: string[];
    /**
     * Hydration-entry scripts, e.g. "/_static/chunks/main.<hash>.js" —
     * what the SSR document loads as bootstrap modules. Usually one file.
     */
    js: string[];
}

let manifest: AssetManifest = { css: [], js: [] };

/** Framework-internal: replace the current asset manifest. */
export function setAssets(next: AssetManifest): void {
    manifest = next;
}

/** Framework-internal: the current asset manifest (for the hydration payload). */
export function getAssets(): AssetManifest {
    return manifest;
}

/**
 * Links the CSS emitted by the client bundle. Render inside <head>.
 * Renders nothing when the app imports no CSS through the bundler.
 */
export function Assets(): ReactElement {
    return (
        <>
            {manifest.css.map((href) => (
                <link key={href} rel="stylesheet" href={href} />
            ))}
        </>
    );
}
