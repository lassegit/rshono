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
import type { RscPayload } from './entry.rsc.js';
import { NavRuntimeContext, type Router } from './navigation.js';
import { createRscRenderRequest } from './request.js';

// In-memory flight-payload cache keyed by same-origin path+search. `data-prefetch`
// links warm it on hover/focus; a navigation to a warmed URL resolves instantly and
// clears the entry (a prefetch is used at most once, so re-visits always re-fetch).
const payloadCache = new Map<string, Promise<RscPayload>>();

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

  let setPayload: (v: RscPayload) => void;
  // Runs work inside the nav transition so useNavigation().pending stays true across the round-trip; BrowserRoot swaps in its instance on mount.
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

  function handleControlDigest(error: unknown): boolean {
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (!isControlDigest(digest)) return false;
    const redirect = parseRedirectDigest(digest);
    if (redirect) push(redirect.location);
    else window.location.reload();
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
          (type, restoreScroll) =>
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
    const { ok, data } = payload.returnValue!;
    if (!ok) throw data;
    return data;
  });

  hydrateRoot(document, <BrowserRoot />, {
    formState: initialPayload.formState,
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

function listenNavigation(onNavigation: (type: NavigationType, restoreScroll: () => void) => void, prefetch: (href: string) => void): () => void {
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
  const notify = (type: NavigationType) => onNavigation(type, restoreScrollFor(type));

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

  function onPrefetch(e: Event) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[data-prefetch]');
    if (link instanceof HTMLAnchorElement && isRouterLink(link)) prefetch(link.href);
  }
  document.addEventListener('pointerover', onPrefetch);
  document.addEventListener('focusin', onPrefetch);

  return () => {
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
    const message = JSON.parse(event.data) as { type: string; hash?: string };
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

main();
