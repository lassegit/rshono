import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import {
  createFromFetch,
  createFromReadableStream,
  createTemporaryReferenceSet,
  encodeReply,
  setServerCallback,
} from 'react-server-dom-rspack/client.browser';
import { isControlDigest, parseRedirectDigest } from './control.js';
import type { DevMessage } from './dev-protocol.js';
import type { RscPayload } from './entry.rsc.js';
import { RouterContext, type Router } from './navigation.js';
import { createRscRequest } from './request.js';

const isDev = process.env.NODE_ENV === 'development';

declare global {
  /** The array the payload `<script>` tags `flight-inject.ts` emits push their chunks into. */
  var __FLIGHT_DATA: Array<string | Uint8Array> | undefined;
}

/**
 * The flight payload the document carried, read back out of `__FLIGHT_DATA`.
 *
 * The reader for the format `flight-inject.ts` writes — 14 lines, which is the whole reason neither
 * half of `rsc-html-stream` is a dependency: its server half mishandles a split document trailer
 * (see `flight-inject.ts`), and once that one is first-party, keeping the package for this one is a
 * dependency for a `for` loop.
 */
function readFlightPayload(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  // Assigned synchronously by `start`, which `new ReadableStream` runs before it returns.
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start: (c) => void (controller = c),
  });
  const enqueue = (chunk: string | Uint8Array) => controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);

  // Payload scripts interleave with the document, so some have already run by the time this module
  // is evaluated — those are in the array — and the rest run after it, arriving through `push`.
  const data = (self.__FLIGHT_DATA ??= []);
  for (const chunk of data) enqueue(chunk);
  data.push = enqueue as typeof data.push;

  // The last payload script lands before the document finishes parsing, so that is what says there
  // is no more of it to come.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => controller.close(), { once: true });
  } else {
    controller.close();
  }
  return stream;
}

/** Created at module evaluation, not inside `main()`, so no chunk can be pushed before it is watching. */
const flightStream = readFlightPayload();

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
  return createFromFetch<RscPayload>(fetch(createRscRequest(new URL(href, location.href).href)));
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

  const initialPayload = await createFromReadableStream<RscPayload>(flightStream);

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

    React.useEffect(() => {
      const stopNavigating = listenNavigation((restoreScroll) =>
        startNav(async () => {
          try {
            await fetchRscPayload();
            restoreScroll();
          } catch {
            window.location.reload();
          }
        }),
      );
      const stopUpgradingLinks = listenLinks(warmPayload);
      return () => {
        stopUpgradingLinks();
        stopNavigating();
      };
    }, []);

    const router = React.useMemo<Router>(() => ({ push, replace, refresh, pending }), [pending]);

    return <RouterContext.Provider value={router}>{payload.root}</RouterContext.Provider>;
  }

  setServerCallback(async (id, args) => {
    const temporaryReferences = createTemporaryReferenceSet();
    const request = createRscRequest(window.location.href, {
      id,
      body: await encodeReply(args, { temporaryReferences }),
    });
    // The action is about to mutate who-knows-what, so anything warmed up to now is pre-mutation
    // data. Cleared before the round-trip so it happens even if the action throws.
    payloadCache.clear();
    let payload: RscPayload;
    try {
      payload = await createFromFetch<RscPayload>(fetch(request), { temporaryReferences });
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

/**
 * Frames to wait for a fragment's target to turn up before giving up and going to the top.
 *
 * A soft navigation restores scroll as soon as the new payload is *set*, and React commits it a tick
 * or more later — so the element a `#hash` names does not exist yet on the first frame.
 */
const MAX_HASH_SCROLL_FRAMES = 10;

/**
 * The element the current URL's fragment points at, or null.
 *
 * `location.hash` comes back percent-encoded while the `id` in the DOM is literal, so a heading like
 * `#créer` only matches once decoded — and the raw form is tried too, for the ids that genuinely
 * contain a `%`.
 */
function hashTarget(): HTMLElement | null {
  const raw = location.hash.slice(1);
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {}
  return document.getElementById(decoded) ?? document.getElementById(raw);
}

/**
 * Defers `run` to the next frame.
 *
 * Every scroll change here goes through this. A navigation restores scroll the moment the new
 * payload is *set*, which is before React has committed it — so the layout being scrolled is still
 * the outgoing one until a frame has passed.
 */
function nextFrame(run: () => void): void {
  requestAnimationFrame(run);
}

/**
 * `nextFrame`, retried once per frame until `find` turns something up or `frames` have gone by.
 * `use` then gets what was found, or null if nothing ever was.
 */
function whenFound<T>(find: () => T | null, frames: number, use: (found: T | null) => void): void {
  let waited = 0;
  nextFrame(function attempt() {
    const found = find();
    if (found !== null) use(found);
    else if (++waited < frames) nextFrame(attempt);
    else use(null);
  });
}

/**
 * Runs teardown in reverse and empties the list, so a second call is a no-op.
 *
 * Collecting these as setup goes keeps each undo next to the thing it undoes: a listener added
 * without one is visible on the spot, rather than as a leak found later against a teardown block
 * that drifted out of sync.
 */
function disposeAll(undo: Array<() => void>): void {
  for (const dispose of undo.splice(0).reverse()) dispose();
}

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

/**
 * Upgrades the app's anchors: a plain left-click becomes a soft navigation, and `data-prefetch`
 * warms the payload on hover or focus.
 *
 * Kept apart from `listenNavigation` because the two share no state. A click here only calls
 * `history.pushState` — which is where that function picks the navigation up — so the whole contract
 * between them is one global the browser already provides.
 */
function listenLinks(prefetch: (href: string) => void): () => void {
  const undo: Array<() => void> = [];

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
  undo.push(() => document.removeEventListener('click', onClick));

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
  undo.push(() => clearTimeout(prefetchTimer));
  document.addEventListener('pointerover', onPrefetch);
  undo.push(() => document.removeEventListener('pointerover', onPrefetch));
  document.addEventListener('focusin', onPrefetch);
  undo.push(() => document.removeEventListener('focusin', onPrefetch));

  return () => disposeAll(undo);
}

function listenNavigation(onNavigation: (restoreScroll: () => void) => void): () => void {
  const undo: Array<() => void> = [];

  // Scroll restoration. We tag each history entry with a stable numeric key in its
  // `history.state` and remember scrollY per key, so back/forward restores the exact
  // position while push scrolls to the top. `manual` hands restoration to us.
  const scrollByKey = new Map<number, number>();
  let seq = 0;
  const prevRestoration = window.history.scrollRestoration;
  try {
    window.history.scrollRestoration = 'manual';
  } catch {}
  undo.push(() => {
    try {
      window.history.scrollRestoration = prevRestoration;
    } catch {}
  });

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
  undo.push(() => window.removeEventListener('scroll', onScroll));

  const restoreScrollFor = (type: NavigationType) => () => {
    if (type === 'replace') return;
    const key = keyOf();
    const remembered = type === 'pop' && key !== null ? scrollByKey.get(key) : undefined;
    if (remembered !== undefined) {
      nextFrame(() => window.scrollTo(0, remembered));
      return;
    }

    // Nothing remembered: a fresh push, or a traversal onto an entry the browser made itself — a
    // same-page anchor never goes through our patched `pushState`, so it was never tagged. In both
    // cases a `#hash` is the stated destination, and the top of the page is only the fallback.
    if (!location.hash) {
      nextFrame(() => window.scrollTo(0, 0));
      return;
    }
    whenFound(hashTarget, MAX_HASH_SCROLL_FRAMES, (target) => (target ? target.scrollIntoView() : window.scrollTo(0, 0)));
  };

  const documentUrl = () => location.pathname + location.search;

  // What the payload on screen was rendered for. Only the document part: the server never sees the
  // fragment, so two URLs differing by one render identically.
  let renderedUrl = documentUrl();

  /**
   * A navigation that moves only the fragment — `#a` → `#b`, or back out of a same-page anchor —
   * leaves the document unchanged, so the payload already on screen is the right one. Fetching
   * another would be a wasted round-trip that re-renders the page out from under the jump.
   *
   * `router.refresh()` is unaffected: it drives the re-fetch directly rather than through here, and
   * remains the way to ask for fresh data at an unchanged URL.
   */
  const notify = (type: NavigationType) => {
    const restoreScroll = restoreScrollFor(type);
    if (documentUrl() === renderedUrl) {
      restoreScroll();
      return;
    }
    renderedUrl = documentUrl();
    onNavigation(restoreScroll);
  };

  const onPopState = () => notify('pop');
  window.addEventListener('popstate', onPopState);
  undo.push(() => window.removeEventListener('popstate', onPopState));

  const oldPushState = window.history.pushState;
  window.history.pushState = function (state, unused, url) {
    const res = oldPushState.call(this, tag(state, seq++), unused, url as string);
    notify('push');
    return res;
  };
  undo.push(() => {
    window.history.pushState = oldPushState;
  });

  const oldReplaceState = window.history.replaceState;
  window.history.replaceState = function (state, unused, url) {
    const res = oldReplaceState.call(this, tag(state, keyOf() ?? seq++), unused, url as string);
    notify('replace');
    return res;
  };
  undo.push(() => {
    window.history.replaceState = oldReplaceState;
  });

  return () => disposeAll(undo);
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
