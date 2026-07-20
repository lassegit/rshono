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
 *     /_rshono/hmr endpoint: client edits hot-apply via HMR with
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
    // CSP mode (RSC_HONO_CSP): the server renders a csp-nonce meta tag;
    // mirror it into the bundler runtime so dynamically loaded chunks
    // carry the nonce too. Must happen before the first deserialization,
    // which may already load client-component chunks.
    const cspMeta = document.querySelector('meta[property="csp-nonce"]') as HTMLMetaElement | null;
    if (cspMeta?.nonce) __webpack_nonce__ = cspMeta.nonce;

    // Stashed so navigation/actions/dev-refresh can re-render from
    // outside the component.
    let setPayload: (v: RscPayload) => void;

    const initialPayload = await createFromReadableStream<RscPayload>(rscStream);

    function BrowserRoot() {
        const [payload, setPayloadState] = React.useState(initialPayload);

        React.useEffect(() => {
            setPayload = (v) => React.startTransition(() => setPayloadState(v));
        }, []);

        React.useEffect(
            () =>
                listenNavigation((type) => {
                    fetchRscPayload()
                        .then(() => {
                            // New page via link/pushState starts at the top;
                            // back/forward keeps the browser's position.
                            if (type === 'push') requestAnimationFrame(() => window.scrollTo(0, 0));
                        })
                        // Payload fetch failed (server restarting, network,
                        // non-page URL) — a full navigation always works.
                        .catch(() => window.location.reload());
                }),
            [],
        );

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

type NavigationType = 'push' | 'replace' | 'pop';

/**
 * Intercept same-origin navigation so page transitions become flight
 * fetches. New-tab/download/modified clicks and in-page anchors fall
 * through to the browser.
 */
function listenNavigation(onNavigation: (type: NavigationType) => void): () => void {
    const onPopState = () => onNavigation('pop');
    window.addEventListener('popstate', onPopState);

    const oldPushState = window.history.pushState;
    window.history.pushState = function (...args) {
        const res = oldPushState.apply(this, args);
        onNavigation('push');
        return res;
    };

    const oldReplaceState = window.history.replaceState;
    window.history.replaceState = function (...args) {
        const res = oldReplaceState.apply(this, args);
        onNavigation('replace');
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
            // In-page anchor (only the hash differs): native scroll, no refetch.
            if (link.hash && link.pathname === location.pathname && link.search === location.search) return;
            e.preventDefault();
            history.pushState(null, '', link.href);
        }
    }
    document.addEventListener('click', onClick);

    return () => {
        document.removeEventListener('click', onClick);
        window.removeEventListener('popstate', onPopState);
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
            console.warn('[rshono] hot update failed, reloading:', error);
            window.location.reload();
        }
    }

    const source = new EventSource('/_rshono/hmr');
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
                console.log('[rshono] server components updated');
                await fetchRscPayload().catch(() => window.location.reload());
                break;
        }
    };
}

main();
