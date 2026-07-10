/**
 * Dev Live Reload
 *
 * An SSE endpoint (/_rs-hono/reload) plus the inline browser snippet
 * that listens to it. Pages — and dev error pages — are stamped at
 * render time with the build version they were rendered from; the dev
 * server broadcasts the current version after every successful client
 * compile, and the browser reloads only when the two DIFFER. That one
 * comparison is what makes reloading race-free:
 *
 *  - server restart (tsx watch): the EventSource reconnects, but the new
 *    process sends nothing until its first compile succeeds — the reload
 *    always lands on a ready bundle, never a half-built one
 *  - page served before the first compile: stamped "pending", so the
 *    first broadcast reloads it (heals the CSS-less first render)
 *  - duplicate watcher callbacks, idle reconnects: same version, no reload
 *
 * The version is `pid:hash` — the pid catches restarts whose bundle is
 * byte-identical (server-only edits), the hash catches rebuilds.
 */
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';

let version: string | null = null; // null until the first successful compile
const clients = new Set<(v: string) => void>();

/** Called from the Rspack watch callback after each successful compile. */
export function announceBuild(hash: string | null): void {
    version = `${process.pid}:${hash ?? Date.now().toString(36)}`;
    for (const send of clients) send(version);
}

/**
 * The snippet stamped into pages (via bootstrapScript) and dev error
 * pages. Inline on purpose: it must run even when main.js 404s
 * (mid-compile) or the page failed to render.
 */
export function reloadScript(): string {
    return `new EventSource('/_rs-hono/reload').onmessage=(e)=>{if(e.data!==${JSON.stringify(version ?? 'pending')})location.reload()};`;
}

export const reloadEndpoint = (c: Context) =>
    streamSSE(c, async (stream) => {
        const send = (v: string) => {
            // A broadcast can race a disconnect — drop the client instead
            // of surfacing a rejected write.
            stream.writeSSE({ data: v, retry: 500 }).catch(() => clients.delete(send));
        };
        clients.add(send);
        if (version) send(version);
        // Hold the connection open until the browser goes away.
        await new Promise<void>((resolve) => {
            stream.onAbort(() => {
                clients.delete(send);
                resolve();
            });
        });
    });
