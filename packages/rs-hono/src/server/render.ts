/**
 * The renderer contract shared by the two SSR implementations:
 *
 *   ssr.ts     — Node, renderToPipeableStream (used by the CLI: dev,
 *                start, build/SSG — React recommends the pipeable API
 *                on Node for throughput)
 *   ssr-web.ts — Web Streams, renderToReadableStream (bundled into
 *                `rs-hono build --target edge` server bundles)
 *
 * buildApp is written against this type, so the composition layer
 * (handler.ts, or the generated server-bundle entry) picks the runtime.
 */
import type { ReactNode } from 'react';

export interface StreamRenderOptions {
    /** The React element to render */
    element: ReactNode;
    /**
     * Inline script injected before hydration.
     * Typically sets window.__RSH. MUST already be safely escaped.
     */
    bootstrapScript?: string;
    /**
     * URLs of the client-entry module scripts (from the asset manifest);
     * React appends them to <body> to start hydration.
     */
    bootstrapModules?: string[];
    /** Called for non-fatal errors inside Suspense boundaries. */
    onError?: (error: unknown) => void;
    /**
     * Called once if the output does not start with "<!DOCTYPE" — i.e.
     * the element tree never rendered <html>, so the response is a
     * fragment rather than a complete document.
     */
    onMissingDocument?: () => void;
    /** Abort a render that is still pending after this many ms. */
    timeoutMs?: number;
}

/**
 * Renders a React tree to a web ReadableStream. Resolves when the SHELL
 * is ready — so the caller can attach the correct HTTP status — and
 * rejects on a shell error (the caller responds with a real 500 instead
 * of a 200 that contains an error page).
 */
export type RenderStream = (options: StreamRenderOptions) => Promise<ReadableStream<Uint8Array>>;
