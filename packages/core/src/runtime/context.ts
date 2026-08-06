/// <reference path="../types/rshono-config.d.ts" />
/**
 * The request context: {@link getRequestContext} and the {@link RequestContext} wrapper it returns,
 * the {@link redirect} / {@link notFound} control-flow helpers, and the
 * {@link onServerError} reporting funnel — plus the `@internal` plumbing that binds
 * a request to the async context in the first place.
 *
 * The public half of this module is re-exported by `runtime/server.ts`, which is
 * what the `@rshono/core/server` subpath resolves to; import *that* from an app. Nothing
 * here is safe in a `'use client'` module — those run in the browser, with no bound
 * request context.
 */

import type { Context, Env } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import { AsyncLocalStorage } from 'node:async_hooks';
import { NotFoundSignal, RedirectSignal } from './control.js';

/**
 * HTTP status codes accepted by {@link redirect}.
 *
 * - `301` Moved Permanently, `308` Permanent Redirect — cacheable, permanent.
 * - `302` Found, `307` Temporary Redirect — temporary.
 * - `303` See Other — the default; forces a `GET` on the target, which is what
 *   you almost always want after a form action (post/redirect/get).
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status#redirection_messages | MDN — redirection status codes}
 */
export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

const contextStorage = new AsyncLocalStorage<Context>();

/** One {@link RequestContext} per Hono {@link Context}, so repeated `getRequestContext()` calls in a request share its lazy getters. */
const wrappers = new WeakMap<Context, RequestContext>();

/**
 * Requests whose page render has begun — the point past which nothing can change the response head.
 *
 * A `WeakSet` keyed on the Hono {@link Context} rather than a field on {@link RequestContext},
 * so marking a request costs nothing for the pages that never read their context: the wrapper is
 * built lazily by {@link getRequestContext} and this must not be what forces it into existence.
 */
const rendering = new WeakSet<Context>();

/**
 * Marks the request as having entered its page render, which is what makes
 * {@link RequestContext.setHeader} and `ctx.cookies.set()` start throwing.
 *
 * Framework internal — `renderComponent` calls this immediately before handing the page to React.
 * Everything that legitimately writes to the response (middleware, a `'use server'` action, an
 * endpoint route) has already run by then, so none of them are affected.
 *
 * @internal
 */
export function beginPageRender(c: Context): void {
  rendering.add(c);
}

/**
 * The shared explanation for a response mutation that arrived too late, thrown by
 * {@link RequestContext.setHeader} and the `cookies` writers.
 *
 * Worth being long: the failure it replaces was silent *and* inconsistent — a page setting a cookie
 * got it on a full page load and lost it on a soft navigation, because the flight stream's response
 * head is committed before the first line of the page component runs. There is no fixing that from
 * inside the render (React starts flight work in a microtask, and neither Hono nor the Node adapter
 * will re-read headers once the response exists), so the honest move is to refuse both ways round
 * and say where the write does belong.
 */
function tooLateToWrite(call: string): never {
  throw new Error(
    `[rshono] ${call} was called while rendering a page, which is too late to affect the response. ` +
      'A page streams, so its response head is already committed by the time the component runs — the ' +
      'write would land on a full page load and be silently dropped on a soft navigation. Do it from a ' +
      "'use server' action instead; or, in middleware and { type: 'endpoint' } routes — which are handed " +
      "Hono's `c` directly and run outside the request context — with `c.header(…)` / `setCookie(c, …)`.",
  );
}

/** The shared explanation for a Hono `Context` member that a page has no way to use. See the stubs on {@link RequestContext}. */
function notOnContext(call: string, instead: string): never {
  throw new Error(
    `[rshono] ctx.${call} does not exist. A page returns JSX and the framework builds the response from it, ` +
      `so Hono's response builders have nothing to return to. ${instead}`,
  );
}

/**
 * `process.env`, snapshotted on first read.
 *
 * It is not a plain object — every enumeration crosses into the host environment, which made
 * spreading it (~20µs) by far the most expensive thing {@link RequestContext.env} did, once per request that
 * touched it. Snapshotted lazily rather than at module load because `loadEnvFiles()` runs *after*
 * this module is imported, so an eager copy would miss everything from `.env`. The trade-off: a
 * `process.env` mutation after the first `ctx.env` read is not picked up.
 */
let envSnapshot: Record<string, string | undefined> | undefined;

function processEnv(): Record<string, string | undefined> {
  return (envSnapshot ??= typeof process !== 'undefined' && process.env ? { ...process.env } : {});
}

/**
 * True when this process is the SSG build prerendering `render: 'static'` routes,
 * rather than a server handling real requests. `build.ts` sets `RSHONO_PRERENDER`
 * before importing the app bundle and starting the prerender pass; the app bundle
 * inlines its own copy of this module, so a shared `process.env` (not a module-level
 * flag) is what reliably crosses that boundary. Read by {@link getRequestContext} to turn a
 * static route's request-context read into a clear build-time error instead of
 * silently baking synthetic build-time values (a `localhost` URL, no cookies, build
 * env) into the snapshot.
 */
const prerendering = typeof process !== 'undefined' && !!process.env?.RSHONO_PRERENDER;

/**
 * Runs `fn` with the given Hono {@link Context} bound as the ambient request
 * context, so that {@link getRequestContext} resolves to it anywhere in the call tree.
 *
 * Framework internal — the request handler wraps every render and action in
 * this. Application code should reach for {@link getRequestContext} instead.
 *
 * @internal
 */
export function runWithContext<T>(c: Context, fn: () => T): T {
  return contextStorage.run(c, fn);
}

/**
 * Reads the matched route params, returning an empty object when there is no
 * active route match (rather than throwing), so the fallback behaviour stays in
 * one place.
 *
 * Framework internal — the request renderer calls this to build a page's `params`
 * prop, and {@link RequestContext.params} caches it. Read them from that prop, or
 * from `ctx.params` outside a page.
 *
 * @internal
 */
export function readParams(c: Context): Record<string, string> {
  try {
    return c.req.param();
  } catch {
    return {};
  }
}

/** A proxy chain appends to these headers, so the client-facing value is the first entry. */
function firstForwardedValue(header: string | undefined): string | undefined {
  const first = header?.split(',')[0]?.trim();
  return first || undefined;
}

// DefinePlugin inlines the config into the server bundle, but this module is the public
// `@rshono/core/server` entry and could be loaded by tooling that doesn't (a unit test, a one-off script).
// Read through `typeof` so that degrades to the safe answer — don't trust — instead of a ReferenceError.
const trustProxy = typeof __RSHONO_CONFIG__ !== 'undefined' && __RSHONO_CONFIG__.trustProxy;

/**
 * Resolves the browser-facing {@link URL} for a request.
 *
 * `c.req.url` reflects the internal address the server was reached on, which is wrong behind a
 * proxy or load balancer. `X-Forwarded-Host` / `X-Forwarded-Proto` fix that up — **but only when
 * `trustProxy` is enabled in `rshono.config.ts`** (always the case under `rshono dev`). Those
 * headers are client-supplied: honouring them unconditionally lets anyone who can reach the server
 * dictate the origin of every absolute URL the app builds — canonical tags, emails, redirects — and
 * poison a shared cache with them. So the default is to ignore them entirely.
 *
 * Framework internal — prefer {@link RequestContext.url}, which caches the result per request.
 *
 * @internal
 */
export function publicUrl(c: Context): URL {
  const url = new URL(c.req.url);
  if (!trustProxy) return url;

  const forwardedHost = firstForwardedValue(c.req.header('x-forwarded-host'));
  // Parsed rather than assigned to `url.host`, because that setter *keeps the existing port* when
  // the new value has none — leaving the internal port on the public URL (`example.com:3000`).
  const forwarded = forwardedHost ? URL.parse(`http://${forwardedHost}`) : null;
  if (forwarded) {
    url.hostname = forwarded.hostname;
    url.port = forwarded.port; // '' when the forwarded host carries no port, which clears it
  }

  // Restricted to the two schemes a browser can actually have requested; anything else (a proxy
  // sending junk, or a client trying its luck) leaves the scheme alone.
  const forwardedProto = firstForwardedValue(c.req.header('x-forwarded-proto'));
  if (forwardedProto === 'http' || forwardedProto === 'https') url.protocol = forwardedProto;

  return url;
}

/**
 * The environment available to a request: Cloudflare/Workers `Bindings` merged
 * with process env vars. Values not declared in `Bindings` are typed as
 * `string | undefined`. See {@link RequestContext.env}.
 *
 * @see {@link https://hono.dev/docs/getting-started/cloudflare-workers#bindings | Hono — bindings}
 */
export type EnvVars<E extends Env> = E['Bindings'] & Record<string, string | undefined>;

/**
 * Ergonomic, read-mostly wrapper around Hono's {@link Context} for use inside
 * server components and server actions.
 *
 * Obtain one with {@link getRequestContext}, or — in a page component — take it straight
 * off the `ctx` prop, which is this same object. Never construct it yourself. One
 * instance is reused for the lifetime of a request, so its lazy getters
 * ({@link RequestContext.url}, {@link RequestContext.env}) are computed at most once.
 *
 * @typeParam E - The Hono {@link Env} describing this app's `Bindings` and
 *   `Variables`, so {@link RequestContext.var} and {@link RequestContext.env} stay typed.
 *
 * @example
 * ```tsx
 * import { getRequestContext } from '@rshono/core/server';
 *
 * export default async function Whoami() {
 *   const ctx = getRequestContext();
 *   const session = ctx.cookies.get('session');
 *   return <p>{ctx.url.pathname} — {session ?? 'anonymous'}</p>;
 * }
 * ```
 *
 * @see {@link https://www.rshono.com/docs/api#rshonocoreserver | Docs — `@rshono/core/server`}
 * @see {@link https://hono.dev/docs/api/context | Hono — Context}, reachable in full via {@link RequestContext.hono}
 */
export class RequestContext<E extends Env = Env> {
  #raw: Context<E>;
  #url?: URL;
  #env?: EnvVars<E>;
  #params?: Record<string, string>;

  /**
   * Framework internal — one instance is created per request and handed to you by
   * {@link getRequestContext} or the `ctx` page prop. Application code never calls this.
   *
   * @internal
   */
  constructor(c: Context<E>) {
    this.#raw = c;
  }

  /**
   * The underlying Hono {@link Context} — the escape hatch for the long tail this wrapper does not
   * expose. Everything a page or action actually reaches for has a home of its own now
   * ({@link RequestContext.req}, {@link RequestContext.params}, {@link RequestContext.setHeader}), so
   * this is for what is left: `executionCtx.waitUntil()` on Workers, and whatever Hono adds next.
   *
   * Be aware that the response builders on it (`redirect`, `notFound`, `json`, `body`, `status`, …)
   * still do nothing from inside a page, for the reason the stubs on this class explain — reaching
   * them through here bypasses the error, it does not make them work.
   *
   * @example
   * ```ts
   * getRequestContext().hono.executionCtx.waitUntil(logAsync()); // Workers
   * ```
   *
   * @see {@link https://hono.dev/docs/api/context | Hono — Context}
   */
  // A getter over a private field rather than a plain property, so it is not an *own enumerable*
  // one — which matters more than it looks. React's diagnostic for a value that cannot be sent to a
  // client component (`describeObjectForErrorMessage`) walks `Object.keys` recursively with no depth
  // limit and no cycle guard, and the Hono context graph reaches the socket and the whole server
  // through `req.raw` and `env`. While this was a plain property, passing a `RequestContext` to a
  // `'use client'` component blew the stack *inside that message builder* — so React's actual,
  // accurate "you cannot pass this" error never got printed. Hidden from `Object.keys`, the walk
  // stops here. Every member added since is a prototype getter or method for the same reason;
  // `cookies` is the one own enumerable property, and it is a shallow object of four functions.
  get hono(): Context<E> {
    return this.#raw;
  }

  /**
   * The parsed request — method, headers, path params, query and the body readers. Hono's
   * {@link Context.req}, unwrapped, so `ctx.req.header('authorization')` rather than
   * `ctx.hono.req.header(…)`.
   *
   * Reads only. Setting a response header is {@link RequestContext.setHeader}, which is a different
   * thing living in a different place on purpose — Hono's `c.header()` writing the *response* while
   * `c.req.header()` reads the *request* is a well-worn source of confusion.
   *
   * @example
   * ```ts
   * const ctx = getRequestContext();
   * ctx.req.method;                     // 'GET'
   * ctx.req.header('authorization');    // string | undefined
   * ctx.req.query('tab');               // string | undefined
   * ```
   *
   * @see {@link https://hono.dev/docs/api/request | Hono — HonoRequest}
   */
  get req(): Context<E>['req'] {
    return this.#raw.req;
  }

  /**
   * Matched route params for this request, e.g. `{ id: '42' }` for `/profile/:id`.
   *
   * A **page** is handed these as its `params` prop, typed key-by-key from its route path, and that
   * is the better read where it is available. This is the same record for everywhere else — a nested
   * server component, or a `'use server'` action — which get no props from the framework. Empty when
   * there is no active route match rather than throwing.
   */
  get params(): Record<string, string> {
    return (this.#params ??= readParams(this.#raw as Context));
  }

  /**
   * The browser-facing request URL — read `url.pathname`, `url.searchParams` and the
   * rest off it. Parsed once and cached, so the same instance comes back on every
   * read within a request; treat it as read-only for that reason.
   *
   * `X-Forwarded-Host` / `-Proto` are honoured only when `trustProxy` is enabled in
   * `rshono.config.ts`, since any client can send them.
   *
   * @see {@link https://www.rshono.com/docs/configuration#proxy-headers | Docs — proxy headers}
   */
  get url(): URL {
    return (this.#url ??= publicUrl(this.#raw as Context));
  }

  /**
   * Typed variables set by middleware via `c.set('user', …)`, read here as
   * `ctx.var.user`. Type them by parameterising this class's {@link Env}.
   *
   * @example
   * ```ts
   * type AppEnv = { Variables: { user: { id: string } } };
   * const { user } = getRequestContext<AppEnv>().var; // typed, set by your middleware
   * ```
   *
   * @see {@link https://hono.dev/docs/api/context#var | Hono — c.var}
   * @see {@link https://www.rshono.com/docs/hono#typing-the-context | Docs — typing the context}
   */
  get var(): Readonly<E['Variables']> {
    return this.#raw.var;
  }

  /**
   * Environment for the request: process env vars merged with runtime bindings
   * (bindings win on conflict). Computed once and cached.
   *
   * @example `const key = getRequestContext().env.STRIPE_SECRET_KEY;`
   *
   * @see {@link https://hono.dev/docs/api/context#env | Hono — c.env}
   * @see {@link https://www.rshono.com/docs/configuration#environment-and-secrets | Docs — environment and secrets}
   */
  get env(): EnvVars<E> {
    if (this.#env) return this.#env;
    const bindings = this.#raw.env as Record<string, unknown> | undefined;
    // The snapshot is shared, so hand it back as-is when there are no bindings to merge over it.
    return (this.#env = (bindings ? { ...processEnv(), ...bindings } : processEnv()) as EnvVars<E>);
  }

  /**
   * Read and write request/response cookies.
   *
   * @example
   * ```ts
   * const ctx = getRequestContext();
   * ctx.cookies.get('session');                       // string | undefined
   * ctx.cookies.set('session', id, { httpOnly: true, sameSite: 'Lax', path: '/' });
   * ctx.cookies.delete('session', { path: '/' });
   * ```
   *
   * @see {@link https://hono.dev/docs/helpers/cookie | Hono — cookie helper}, which this wraps
   */
  cookies = {
    /** Reads a single cookie by name, or `undefined` if absent. Safe anywhere, a page included. */
    get: (name: string): string | undefined => getCookie(this.#raw, name),
    /** Reads every cookie as a `{ name: value }` record. Safe anywhere, a page included. */
    all: (): Record<string, string> => getCookie(this.#raw),
    /**
     * Sets a cookie on the response. See Hono's {@link CookieOptions} for `path`, `httpOnly`,
     * `maxAge`, etc.
     *
     * **Throws inside a page render** — see {@link RequestContext.setHeader}, of which a `Set-Cookie`
     * is a special case. Set cookies from a `'use server'` action, or with Hono's `setCookie(c, …)`
     * in middleware and endpoint routes.
     *
     * @throws If called while a page is rendering, where it could not reach the browser reliably.
     *
     * @see {@link https://hono.dev/docs/helpers/cookie#options | Hono — cookie options}
     */
    set: (name: string, value: string, options?: CookieOptions): void => {
      this.#assertWritable('ctx.cookies.set()');
      setCookie(this.#raw, name, value, options);
    },
    /**
     * Clears a cookie. Pass the same `path`/`domain` it was set with so the browser matches it.
     * Throws inside a page render, exactly as `set` does.
     *
     * @throws If called while a page is rendering.
     */
    delete: (name: string, options?: CookieOptions): void => {
      this.#assertWritable('ctx.cookies.delete()');
      deleteCookie(this.#raw, name, options);
    },
  };

  /** Guards every write that has to reach the response head. See {@link tooLateToWrite}. */
  #assertWritable(call: string): void {
    if (rendering.has(this.#raw as Context)) tooLateToWrite(call);
  }

  /**
   * Sets a header on the response — from a `'use server'` action, which is the one place a request
   * context exists *and* the response is still open.
   *
   * From inside a page it throws. By then the response head is committed: a page streams, and on a
   * soft navigation the flight response is built before the component's first line runs. Hono's
   * `c.header()` fails there silently and inconsistently — landing on a full page load, vanishing on
   * a soft navigation — so this refuses rather than doing it half the time.
   *
   * Middleware and `{ type: 'endpoint' }` routes run outside the request context (no
   * {@link getRequestContext} there) but are handed Hono's `c` directly, so they set headers with
   * `c.header(…)`. That is also where a header belonging to the *page* rather than to one action
   * goes — `Cache-Control`, `X-Robots-Tag` — since middleware runs before the render.
   *
   * @param name - Header name, case-insensitive.
   * @param value - Header value.
   * @param options - `{ append: true }` to add another value rather than replace.
   * @throws If called while a page is rendering, where it could not reach the browser reliably.
   *
   * @example
   * ```ts
   * 'use server';
   * export async function logout() {
   *   const ctx = getRequestContext();
   *   ctx.cookies.delete('session', { path: '/' });
   *   ctx.setHeader('clear-site-data', '"cache", "storage"');
   *   redirect('/');
   * }
   * ```
   */
  setHeader(name: string, value: string, options?: { append?: boolean }): void {
    this.#assertWritable('ctx.setHeader()');
    this.#raw.header(name, value, options);
  }

  // Hono's response builders, restated as errors that name the thing to use instead. A page returns
  // JSX and `renderComponent` builds the response from it, so every one of these is a silent no-op
  // through `ctx.hono` — which is exactly the confusion this class exists to remove. They are
  // `@deprecated` so an editor strikes them through in autocomplete: visible, and visibly wrong.
  //
  // Each takes `...args: unknown[]` it never reads, so that `ctx.redirect('/dashboard')` reaches the
  // message below instead of stopping at "Expected 0 arguments, but got 1" — an arity complaint that
  // says nothing about what to do. The `@deprecated` strike-through is the compile-time signal; the
  // thrown message is the one that explains.

  /** @deprecated Not available on a page's context — use `redirect()` from `@rshono/core/server`. */
  redirect(...args: unknown[]): never {
    return notOnContext(
      'redirect(location, status?)',
      "Use `redirect()` from '@rshono/core/server', which throws a signal the framework turns into a real redirect.",
    );
  }

  /** @deprecated Not available on a page's context — use `notFound()` from `@rshono/core/server`. */
  notFound(...args: unknown[]): never {
    return notOnContext('notFound()', "Use `notFound()` from '@rshono/core/server', which aborts the render and shows the app's not-found page.");
  }

  /** @deprecated A page renders JSX. For a JSON response, use an `{ type: 'endpoint' }` route. */
  json(...args: unknown[]): never {
    return notOnContext('json(object)', "For a JSON response use an { type: 'endpoint' } route; to read the request body use `ctx.req.json()`.");
  }

  /** @deprecated A page renders JSX. For a text response, use an `{ type: 'endpoint' }` route. */
  text(...args: unknown[]): never {
    return notOnContext('text(string)', "For a text response use an { type: 'endpoint' } route; to read the request body use `ctx.req.text()`.");
  }

  /** @deprecated A page renders JSX, which the framework turns into HTML for you. */
  html(...args: unknown[]): never {
    return notOnContext('html(string)', "A page's JSX is already its HTML; for a hand-built HTML response use an { type: 'endpoint' } route.");
  }

  /** @deprecated Not available on a page's context. To read the request body, use `ctx.req`. */
  body(...args: unknown[]): never {
    return notOnContext(
      'body(data, …)',
      "To read the *request* body use `ctx.req.json()` / `ctx.req.text()` / `ctx.req.formData()`; to build a response, use an { type: 'endpoint' } route.",
    );
  }

  /** @deprecated A page's status is set by the framework — use `notFound()`, or an endpoint route. */
  status(...args: unknown[]): never {
    return notOnContext(
      'status(code)',
      "A page's status is the framework's: 200, 404 via `notFound()`, 500 when it throws. For any other code use an { type: 'endpoint' } route.",
    );
  }

  /** @deprecated Renamed — use `ctx.setHeader(name, value)`, which is valid from a `'use server'` action. */
  header(...args: unknown[]): never {
    return notOnContext(
      'header(name, value)',
      "Use `ctx.setHeader(name, value)` from a 'use server' action, or `c.header(…)` in middleware — a page renders too late to set one.",
    );
  }
}

/**
 * Returns the {@link RequestContext} for the current request.
 *
 * This is the primary entry point for reading request data from a server
 * component or server action — the URL, cookies, params, env, and middleware
 * variables. The returned wrapper is memoised per request, so repeated calls in
 * the same request are cheap and return the same instance.
 *
 * A **page** component is handed the very same object as its `ctx` prop, so this
 * import is for everywhere else: a nested server component, or a `'use server'`
 * action module — neither of which receives props from the framework.
 *
 * @typeParam E - The app's Hono {@link Env}, to type {@link RequestContext.var} and {@link RequestContext.env}.
 * @throws If called at module load, where there is no ambient context to resolve.
 * @throws If called while prerendering a `render: 'static'` route, which has no
 *   per-request context at build time — mark the route `render: 'dynamic'` instead.
 *
 * @example
 * ```ts
 * 'use server';
 * import { getRequestContext, redirect } from '@rshono/core/server';
 *
 * export async function login(form: FormData) {
 *   getRequestContext().cookies.set('session', String(form.get('email')), { httpOnly: true });
 *   redirect('/dashboard');
 * }
 * ```
 *
 * @see {@link https://www.rshono.com/docs/api#rshonocoreserver | Docs — `@rshono/core/server`}
 */
export function getRequestContext<E extends Env = Env>(): RequestContext<E> {
  if (prerendering) {
    throw new Error(
      "[rshono] getRequestContext() was called while prerendering a `render: 'static'` route. A static page " +
        'is rendered once at build time, so it has no per-request context to read (URL, cookies, ' +
        "headers, env). Change this route to `render: 'dynamic'` so it renders per request, or remove " +
        'the getRequestContext() call.',
    );
  }
  const c = contextStorage.getStore();
  if (!c) {
    throw new Error(
      '[rshono] getRequestContext() was called outside a request. It only works inside a server component or a server action, not at module load.',
    );
  }
  let ctx = wrappers.get(c);
  if (!ctx) {
    ctx = new RequestContext(c);
    wrappers.set(c, ctx);
  }
  return ctx as unknown as RequestContext<E>;
}

/**
 * Redirects the request to `location` by throwing a control signal that the
 * framework catches and turns into an HTTP redirect response.
 *
 * Because it throws, it never returns — TypeScript narrows away any code after
 * the call, and you do not need to `return` it. Do not wrap it in a `try/catch`
 * that swallows the signal.
 *
 * @param location - Absolute path or URL to redirect to, e.g. `/dashboard`.
 * @param status - Redirect {@link RedirectStatus}; defaults to `303` (See Other),
 *   the correct choice after a form action so the browser follows up with a `GET`.
 *
 * @example
 * ```ts
 * const session = getRequestContext().cookies.get('session');
 * if (!session) redirect('/login');
 * // session is defined below this line
 * ```
 */
export function redirect(location: string, status: RedirectStatus = 303): never {
  throw new RedirectSignal(location, status);
}

/**
 * Aborts the current render with a 404, rendering the app's not-found page.
 *
 * Like {@link redirect}, this throws a control signal and never returns, so
 * TypeScript narrows away everything after the call. Do not catch-and-swallow it.
 *
 * @example
 * ```tsx
 * export default async function Page({ params }: PageProps<'/users/:id'>) {
 *   const user = await db.user.find(params.id);
 *   if (!user) notFound();
 *   return <Profile user={user} />; // user is non-null here
 * }
 * ```
 */
export function notFound(): never {
  throw new NotFoundSignal();
}

/**
 * Which stage of a request produced an error handed to an {@link ServerErrorHandler}.
 *
 * - `action` — a `'use server'` function threw. React sends the client an opaque marker with no
 *   message in production, so this is the only place the real error is visible.
 * - `render` — a server component threw while the flight payload was being produced.
 * - `ssr` — SSR failed before the HTML shell could be sent, so the `error` page was unreachable too.
 * - `request` — anything else that reached the top-level handler, including a thrown endpoint route.
 */
export type ServerErrorSource = 'action' | 'render' | 'ssr' | 'request';

/** What an {@link ServerErrorHandler} is told about an error, beyond the error itself. */
export interface ServerErrorContext {
  /** The stage that produced it — see {@link ServerErrorSource}. */
  source: ServerErrorSource;
  /** The request being served, for the URL, method and headers. */
  request: Request;
}

/** Handler registered with {@link onServerError}. Called for the side effect; its return value is ignored. */
export type ServerErrorHandler = (error: unknown, context: ServerErrorContext) => void;

let errorHandler: ServerErrorHandler | undefined;

/**
 * Registers a handler for every error the framework catches, so they can reach an error tracker
 * (Sentry, Datadog, a log pipeline) instead of only `stderr`.
 *
 * Call it **once, at the top level of `src/server.ts`** — that module is imported as the server
 * starts, before any request is served. Registering again replaces the previous handler.
 *
 * Errors are still written to `stderr` either way, so a handler adds a destination rather than
 * replacing one. A handler that throws is caught and logged: reporting must never be able to fail
 * a request.
 *
 * @example
 * ```ts
 * // src/server.ts
 * import * as Sentry from '@sentry/node';
 * import { onServerError } from '@rshono/core/server';
 *
 * onServerError((error, { source, request }) => {
 *   Sentry.captureException(error, { tags: { source }, extra: { url: request.url } });
 * });
 * ```
 *
 * @see {@link https://www.rshono.com/docs/hono#error-reporting | Docs — error reporting}
 */
export function onServerError(handler: ServerErrorHandler): void {
  errorHandler = handler;
}

/**
 * Logs an error and forwards it to the registered {@link ServerErrorHandler}.
 *
 * Framework internal — the single funnel every caught server-side error goes through, so that
 * adding a reporting destination is one registration rather than a hook per call site.
 *
 * @internal
 */
export function reportServerError(error: unknown, info: ServerErrorContext & { message: string }): void {
  console.error(info.message, error);
  if (!errorHandler) return;
  try {
    errorHandler(error, { source: info.source, request: info.request });
  } catch (handlerError) {
    console.error('[rshono] the onServerError handler threw:', handlerError);
  }
}
