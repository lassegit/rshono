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
import { isControlDigest, parseRedirectDigest } from './control.js';
import type { DevMessage } from './dev-protocol.js';
import type { RscPayload } from './entry.rsc.js';
import { NavRuntimeContext, type Router } from './navigation.js';
import { createRscRenderRequest } from './request.js';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Guarantees somewhere to attach the fatal overlay. React's root container is the whole `document`,
 * so by the time an uncaught error has torn the tree down, `<body>` — or even `<html>` — may be gone.
 */
function overlayHost(): HTMLElement {
  if (!document.documentElement) document.appendChild(document.createElement('html'));
  if (!document.body) document.documentElement.appendChild(document.createElement('body'));
  return document.body;
}

/**
 * Replaces the white screen of death with something readable.
 *
 * Because the root container is `document`, an uncaught render error leaves a genuinely blank page
 * with the reason only in the console — so this paints the reason over it instead. In development
 * that's the full stack; in production it's a generic notice plus a reload button, since the tree is
 * unrecoverable and reloading is the only way forward.
 *
 * Written with DOM calls rather than React (the renderer is what just failed) and `textContent`
 * rather than `innerHTML` (an error message is untrusted input).
 */
function showFatal(error: unknown, componentStack?: string | null): void {
  // Queued rather than run inline: React's teardown happens after this callback returns, and would
  // remove a node appended synchronously along with the rest of the tree.
  setTimeout(() => {
    const host = overlayHost();
    host.querySelector('[data-rshono-fatal]')?.remove();

    const box = document.createElement('div');
    box.setAttribute('data-rshono-fatal', '');
    box.setAttribute('role', 'alert'); // the page is gone; announce it rather than leaving silence
    box.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;overflow:auto;padding:1.5rem;background:#18181b;color:#f4f4f5;' +
      'font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:left';

    const title = document.createElement('div');
    title.textContent = isDev ? 'Unhandled error' : 'Something went wrong';
    title.style.cssText = 'font-size:1.0625rem;font-weight:700;color:#f87171;margin:0 0 0.75rem';
    box.appendChild(title);

    if (isDev) {
      const detail = document.createElement('pre');
      detail.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word';
      detail.textContent =
        (error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error)) +
        (componentStack ? `\n\nComponent stack:${componentStack}` : '');
      box.appendChild(detail);
    } else {
      const message = document.createElement('p');
      message.textContent = 'This page hit an unexpected error and can’t continue.';
      message.style.cssText = 'margin:0 0 1rem;color:#d4d4d8';
      box.appendChild(message);
    }

    const reload = document.createElement('button');
    reload.textContent = 'Reload page';
    reload.style.cssText =
      'margin-top:1.25rem;padding:0.5rem 1rem;font:inherit;color:#18181b;background:#f4f4f5;border:0;border-radius:4px;cursor:pointer';
    reload.addEventListener('click', () => window.location.reload());
    box.appendChild(reload);

    host.appendChild(box);
  }, 0);
}

// In-memory flight-payload cache keyed by same-origin path+search. `data-prefetch`
// links warm it on hover/focus; a navigation to a warmed URL resolves instantly and
// clears the entry (a prefetch is used at most once, so re-visits always re-fetch).
const payloadCache = new Map<string, Promise<RscPayload>>();

// Bounded so a long session over a link-dense app can't grow it without limit. Insertion-ordered,
// so the first key is the least recently warmed.
const MAX_WARMED_PAYLOADS = 8;

function cacheKey(href: string): string | null {
  const url = new URL(href, location.href);
  if (url.origin !== location.origin) return null;
  return url.pathname + url.search;
}

function requestPayload(href: string): Promise<RscPayload> {
  return createFromFetch<RscPayload>(fetch(createRscRenderRequest(new URL(href, location.href).href)));
}

function warmPayload(href: string): void {
  const key = cacheKey(href);
  if (!key || key === cacheKey(location.href) || payloadCache.has(key)) return;
  const promise = requestPayload(href);
  payloadCache.set(key, promise);
  // One entry in means at most one out, and the first key is the oldest.
  if (payloadCache.size > MAX_WARMED_PAYLOADS) payloadCache.delete(payloadCache.keys().next().value!);
  // Don't cache failures, and swallow the rejection until (or unless) a nav awaits it.
  promise.catch(() => {
    if (payloadCache.get(key) === promise) payloadCache.delete(key);
  });
}

function takePayload(href: string): Promise<RscPayload> {
  const key = cacheKey(href);
  if (key) {
    const cached = payloadCache.get(key);
    if (cached) {
      payloadCache.delete(key);
      return cached;
    }
  }
  return requestPayload(href);
}

async function main() {
  const cspMeta = document.querySelector('meta[property="csp-nonce"]') as HTMLMetaElement | null;
  if (cspMeta?.nonce) __webpack_nonce__ = cspMeta.nonce;

  // Both are replaced by BrowserRoot's own on mount. The defaults matter: `setServerCallback` is
  // registered before hydration, so an action or refresh firing in that window would otherwise call
  // an unassigned binding. Until there's a root to update, a full reload is the honest fallback.
  let setPayload: (v: RscPayload) => void = () => {
    window.location.reload();
  };
  // Runs work inside the nav transition so useNavigation().pending stays true across the round-trip.
  let startNav: (run: () => void | Promise<void>) => void = (run) => {
    void run();
  };

  const initialPayload = await createFromReadableStream<RscPayload>(rscStream);

  function push(href: string) {
    const target = new URL(href, window.location.href);
    if (target.origin !== window.location.origin) {
      window.location.assign(target.href);
      return;
    }
    window.history.pushState(null, '', target.href);
  }

  function replace(href: string) {
    const target = new URL(href, window.location.href);
    if (target.origin !== window.location.origin) {
      window.location.replace(target.href);
      return;
    }
    window.history.replaceState(null, '', target.href);
  }

  const back = () => window.history.back();
  const forward = () => window.history.forward();
  // A refresh keeps the URL, so it can't ride the history patch like push/replace — it drives the flight re-fetch directly (bypassing any warmed cache to get fresh data).
  const refresh = () =>
    startNav(async () => {
      try {
        await fetchRscPayload(true);
      } catch {
        window.location.reload();
      }
    });

  /**
   * Turns a control-signal digest — how `redirect()` / `notFound()` reach the browser — into a real
   * navigation. Returns false for anything else, so callers can fall through to their own handling.
   *
   * `hard` forces a full document load, for signals that surfaced *through React* (a nested
   * component's redirect, reported via the root error handlers). React unmounts the root on an
   * uncaught error, so there is no live tree left to soft-navigate with. A signal caught earlier —
   * a top-level payload rejection — still swaps the payload in place.
   */
  function handleControlDigest(error: unknown, { hard = false }: { hard?: boolean } = {}): boolean {
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (!isControlDigest(digest)) return false;
    const redirect = parseRedirectDigest(digest);
    if (!redirect) {
      window.location.reload();
    } else if (hard) {
      window.location.assign(new URL(redirect.location, window.location.href).href);
    } else {
      push(redirect.location);
    }
    return true;
  }

  async function fetchRscPayload(force = false) {
    let payload: RscPayload;
    try {
      payload = await (force ? requestPayload(window.location.href) : takePayload(window.location.href));
    } catch (error) {
      if (handleControlDigest(error)) return;
      throw error;
    }
    if (payload.redirect) return push(payload.redirect);
    setPayload(payload);
  }

  function BrowserRoot() {
    const [payload, setPayloadState] = React.useState(initialPayload);
    const [pending, startTransition] = React.useTransition();

    React.useEffect(() => {
      setPayload = (v) => setPayloadState(v);
      startNav = (run) => startTransition(run);
    }, [startTransition]);

    React.useEffect(
      () =>
        listenNavigation(
          (restoreScroll) =>
            startNav(async () => {
              try {
                await fetchRscPayload();
                restoreScroll();
              } catch {
                window.location.reload();
              }
            }),
          warmPayload,
        ),
      [],
    );

    const runtime = React.useMemo<Router>(() => ({ push, replace, back, forward, refresh, pending }), [pending]);

    return <NavRuntimeContext.Provider value={runtime}>{payload.root}</NavRuntimeContext.Provider>;
  }

  setServerCallback(async (id, args) => {
    const temporaryReferences = createTemporaryReferenceSet();
    const renderRequest = createRscRenderRequest(window.location.href, {
      id,
      body: await encodeReply(args, { temporaryReferences }),
    });
    // The action is about to mutate who-knows-what, so anything warmed up to now is pre-mutation
    // data. Cleared before the round-trip so it happens even if the action throws.
    payloadCache.clear();
    let payload: RscPayload;
    try {
      payload = await createFromFetch<RscPayload>(fetch(renderRequest), { temporaryReferences });
    } catch (error) {
      if (handleControlDigest(error)) return undefined;
      throw error;
    }
    if (payload.redirect) {
      push(payload.redirect);
      return undefined;
    }
    React.startTransition(() => setPayload(payload));
    if (payload.notFound) return undefined;
    const result = payload.returnValue!;
    if (!result.ok) throw result.error;
    return result.value;
  });

  // A `redirect()` / `notFound()` from a component *below* the page root can only reach us through
  // React: it rides the flight payload as an error at that component's position, and boundaries
  // re-throw it (see boundaries.tsx) so it lands here rather than rendering an error fallback.
  //
  // Anything that isn't a control signal falls back to what React would have done on its own —
  // console for a caught error, `reportError` (i.e. window.onerror, so error-reporting tools still
  // see it) for an uncaught one. Overriding these hooks means opting out of that default, so it has
  // to be put back by hand.
  hydrateRoot(document, <BrowserRoot />, {
    formState: initialPayload.formState,
    onCaughtError: (error, errorInfo) => {
      if (handleControlDigest(error, { hard: true })) return;
      // A boundary handled this and the tree is intact, so no overlay: whatever fallback the app
      // chose is the right thing to have on screen.
      console.error(error, errorInfo.componentStack ?? '');
    },
    onUncaughtError: (error, errorInfo) => {
      if (handleControlDigest(error, { hard: true })) return;
      // Nothing caught it, so React tears the root down — and the root is `document`. This is the
      // white screen; paint the reason over it.
      globalThis.reportError(error);
      showFatal(error, errorInfo.componentStack);
    },
  });

  if (import.meta.webpackHot) {
    // Server code may have changed, so drop any warmed payloads and re-fetch fresh.
    initDevRefresh(() => {
      payloadCache.clear();
      return fetchRscPayload(true);
    });
  }
}

type NavigationType = 'push' | 'replace' | 'pop';

/** Hover/focus dwell time before a `data-prefetch` link warms its payload. */
const PREFETCH_DELAY_MS = 120;

// An `<a>` we intercept for soft navigation: same-origin, same tab, not a download,
// and not explicitly opted out with `data-native` (which forces a full browser navigation).
function isRouterLink(link: HTMLAnchorElement): boolean {
  return (
    !!link.href &&
    (!link.target || link.target === '_self') &&
    link.origin === location.origin &&
    !link.hasAttribute('download') &&
    !link.hasAttribute('data-native')
  );
}

function listenNavigation(onNavigation: (restoreScroll: () => void) => void, prefetch: (href: string) => void): () => void {
  // Scroll restoration. We tag each history entry with a stable numeric key in its
  // `history.state` and remember scrollY per key, so back/forward restores the exact
  // position while push scrolls to the top. `manual` hands restoration to us.
  const scrollByKey = new Map<number, number>();
  let seq = 0;
  const prevRestoration = window.history.scrollRestoration;
  try {
    window.history.scrollRestoration = 'manual';
  } catch {}

  const keyOf = (): number | null => {
    const state = window.history.state as { __rshonoScroll?: unknown } | null;
    return state && typeof state.__rshonoScroll === 'number' ? state.__rshonoScroll : null;
  };
  const tag = (state: unknown, key: number) => ({ ...(state as object | null), __rshonoScroll: key });

  if (keyOf() === null) {
    window.history.replaceState(tag(window.history.state, seq++), '');
  }

  let scrollRaf = 0;
  const onScroll = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      const key = keyOf();
      if (key !== null) scrollByKey.set(key, window.scrollY);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  const restoreScrollFor = (type: NavigationType) => () => {
    if (type === 'replace') return;
    const key = keyOf();
    requestAnimationFrame(() => {
      const y = type === 'pop' && key !== null ? (scrollByKey.get(key) ?? 0) : 0;
      window.scrollTo(0, y);
    });
  };
  const notify = (type: NavigationType) => onNavigation(restoreScrollFor(type));

  const onPopState = () => notify('pop');
  window.addEventListener('popstate', onPopState);

  const oldPushState = window.history.pushState;
  window.history.pushState = function (state, unused, url) {
    const res = oldPushState.call(this, tag(state, seq++), unused, url as string);
    notify('push');
    return res;
  };

  const oldReplaceState = window.history.replaceState;
  window.history.replaceState = function (state, unused, url) {
    const res = oldReplaceState.call(this, tag(state, keyOf() ?? seq++), unused, url as string);
    notify('replace');
    return res;
  };

  function onClick(e: MouseEvent) {
    const link = (e.target as Element).closest('a');
    if (
      link &&
      link instanceof HTMLAnchorElement &&
      isRouterLink(link) &&
      e.button === 0 &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      !e.defaultPrevented
    ) {
      if (link.hash && link.pathname === location.pathname && link.search === location.search) return;
      e.preventDefault();
      history.pushState(null, '', link.href);
    }
  }
  document.addEventListener('click', onClick);

  // A prefetch is a full server render, so it waits out a short dwell time on one shared timer:
  // sweeping the cursor across a list of prefetch links costs one request (for the link the pointer
  // settled on), not one per link.
  let prefetchTimer: ReturnType<typeof setTimeout> | undefined;
  function onPrefetch(e: Event) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[data-prefetch]');
    if (!(link instanceof HTMLAnchorElement) || !isRouterLink(link)) return;
    const { href } = link;
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(() => prefetch(href), PREFETCH_DELAY_MS);
  }
  document.addEventListener('pointerover', onPrefetch);
  document.addEventListener('focusin', onPrefetch);

  return () => {
    clearTimeout(prefetchTimer);
    document.removeEventListener('click', onClick);
    document.removeEventListener('pointerover', onPrefetch);
    document.removeEventListener('focusin', onPrefetch);
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('scroll', onScroll);
    window.history.pushState = oldPushState;
    window.history.replaceState = oldReplaceState;
    try {
      window.history.scrollRestoration = prevRestoration;
    } catch {}
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
      if (hash !== __webpack_hash__) await applyClientUpdate(hash);
    } catch (error) {
      console.warn('[rshono] hot update failed, reloading:', error);
      window.location.reload();
    }
  }

  const source = new EventSource('/_rshono/hmr');
  source.onmessage = async (event) => {
    const message = JSON.parse(event.data) as DevMessage;
    switch (message.type) {
      case 'hello':
        if (connectedOnce) {
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

// Bootstrap failures (a truncated or malformed initial flight payload, most likely) would otherwise
// be an unhandled rejection: nothing hydrates, nothing is reported, and the page just sits there.
main().catch((error) => {
  console.error('[rshono] the client runtime failed to start:', error);
  showFatal(error);
});
