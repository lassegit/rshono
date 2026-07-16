/**
 * Client entry — the only script the browser boots.
 *
 * Hydrates the document from the flight payload the server inlined into
 * the HTML stream (rsc-html-stream), then owns three concerns:
 *
 *   soft navigation — same-origin link clicks and history traversal
 *     re-fetch the new URL as a flight payload and re-render in a
 *     transition, preserving client component state.
 *   server actions — React calls the registered server callback when
 *     client code invokes a 'use server' function; the POST returns a
 *     fresh flight payload (post-action UI) plus the return value.
 *   dev refresh (dev bundles only) — an SSE connection to the CLI's
 *     /_rsc-hono/hmr endpoint: client edits hot-apply via HMR with
 *     react-refresh (full reload as fallback), server component edits
 *     re-fetch the flight payload in place.
 */
import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import {
    createFromFetch,
    createFromReadableStream,
    createTemporaryReferenceSet,
    encodeReply,
    setServerCallback,
} from 'react-server-dom-rspack/client.browser';
import { rscStream } from 'rsc-html-stream/client';
import type { RscPayload } from './entry.rsc.js';
import { createRscRenderRequest } from './request.js';

async function main() {
    // Stashed so navigation/actions/dev-refresh can re-render from
    // outside the component.
    let setPayload: (v: RscPayload) => void;

    const initialPayload = await createFromReadableStream<RscPayload>(rscStream);

    function BrowserRoot() {
        const [payload, setPayloadState] = React.useState(initialPayload);

        React.useEffect(() => {
            setPayload = (v) => React.startTransition(() => setPayloadState(v));
        }, []);

        React.useEffect(() => listenNavigation(() => fetchRscPayload()), []);

        return payload.root;
    }

    async function fetchRscPayload() {
        const renderRequest = createRscRenderRequest(window.location.href);
        const payload = await createFromFetch<RscPayload>(fetch(renderRequest));
        setPayload(payload);
    }

    // Transport for 'use server' calls from hydrated client code.
    setServerCallback(async (id, args) => {
        const temporaryReferences = createTemporaryReferenceSet();
        const renderRequest = createRscRenderRequest(window.location.href, {
            id,
            body: await encodeReply(args, { temporaryReferences }),
        });
        const payload = await createFromFetch<RscPayload>(fetch(renderRequest), { temporaryReferences });
        setPayload(payload);
        const { ok, data } = payload.returnValue!;
        if (!ok) throw data;
        return data;
    });

    hydrateRoot(document, <BrowserRoot />, {
        formState: initialPayload.formState,
    });

    if (import.meta.webpackHot) {
        initDevRefresh(fetchRscPayload);
    }
}

/**
 * Intercept same-origin navigation so page transitions become flight
 * fetches. New-tab/download/modified clicks fall through to the browser.
 */
function listenNavigation(onNavigation: () => void): () => void {
    window.addEventListener('popstate', onNavigation);

    const oldPushState = window.history.pushState;
    window.history.pushState = function (...args) {
        const res = oldPushState.apply(this, args);
        onNavigation();
        return res;
    };

    const oldReplaceState = window.history.replaceState;
    window.history.replaceState = function (...args) {
        const res = oldReplaceState.apply(this, args);
        onNavigation();
        return res;
    };

    function onClick(e: MouseEvent) {
        const link = (e.target as Element).closest('a');
        if (
            link &&
            link instanceof HTMLAnchorElement &&
            link.href &&
            (!link.target || link.target === '_self') &&
            link.origin === location.origin &&
            !link.hasAttribute('download') &&
            e.button === 0 &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.shiftKey &&
            !e.defaultPrevented
        ) {
            e.preventDefault();
            history.pushState(null, '', link.href);
        }
    }
    document.addEventListener('click', onClick);

    return () => {
        document.removeEventListener('click', onClick);
        window.removeEventListener('popstate', onNavigation);
        window.history.pushState = oldPushState;
        window.history.replaceState = oldReplaceState;
    };
}

/**
 * Dev-only refresh client (stripped from prod bundles: the whole call is
 * guarded by import.meta.webpackHot). Listens to the CLI's SSE endpoint:
 *
 *   client-built  → hot-apply the waiting updates (react-refresh keeps
 *                   component state); any failure falls back to reload.
 *   rsc-update    → server component code changed: re-fetch the flight
 *                   payload for the current URL, state preserved.
 *   hello         → sent on (re)connect with the latest build hash; a
 *                   mismatch means events were missed — resync.
 */
function initDevRefresh(fetchRscPayload: () => Promise<void>) {
    let connectedOnce = false;

    async function applyClientUpdate(hash: string) {
        const hot = import.meta.webpackHot!;
        if (hash === __webpack_hash__) return;
        if (hot.status() !== 'idle') {
            window.location.reload();
            return;
        }
        try {
            await hot.check(true);
            // More updates may have queued while this one applied.
            if (hash !== __webpack_hash__) await applyClientUpdate(hash);
        } catch (error) {
            console.warn('[rsc-hono] hot update failed, reloading:', error);
            window.location.reload();
        }
    }

    const source = new EventSource('/_rsc-hono/hmr');
    source.onmessage = async (event) => {
        const message = JSON.parse(event.data) as { type: string; hash?: string };
        switch (message.type) {
            case 'hello':
                if (connectedOnce) {
                    // Reconnected — we may have missed events.
                    if (message.hash && message.hash !== __webpack_hash__) await applyClientUpdate(message.hash);
                    await fetchRscPayload().catch(() => window.location.reload());
                }
                connectedOnce = true;
                break;
            case 'client-built':
                if (message.hash) await applyClientUpdate(message.hash);
                break;
            case 'rsc-update':
                console.log('[rsc-hono] server components updated');
                await fetchRscPayload().catch(() => window.location.reload());
                break;
        }
    };
}

main();
