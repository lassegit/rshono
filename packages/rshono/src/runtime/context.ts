import type { Context, Env, HonoRequest } from 'hono';
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
 */
export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

const store = new AsyncLocalStorage<Context>();

const wrappers = new WeakMap<Context, Ctx>();

/**
 * True when this process is the SSG build prerendering `kind: 'static'` routes,
 * rather than a server handling real requests. `build.ts` sets `RSC_HONO_PRERENDER`
 * before importing the app bundle and starting the prerender pass; the app bundle
 * inlines its own copy of this module, so a shared `process.env` (not a module-level
 * flag) is what reliably crosses that boundary. Read by {@link getContext} to turn a
 * static route's request-context read into a clear build-time error instead of
 * silently baking synthetic build-time values (a `localhost` URL, no cookies, build
 * env) into the snapshot.
 */
function isPrerendering(): boolean {
  return typeof process !== 'undefined' && !!process.env?.RSC_HONO_PRERENDER;
}

/**
 * Runs `fn` with the given Hono {@link Context} bound as the ambient request
 * context, so that {@link getContext} resolves to it anywhere in the call tree.
 *
 * Framework internal — the request handler wraps every render and action in
 * this. Application code should reach for {@link getContext} instead.
 *
 * @internal
 */
export function runWithContext<T>(c: Context, fn: () => T): T {
  return store.run(c, fn);
}

/**
 * Resolves the browser-facing {@link URL} for a request, honouring reverse-proxy
 * headers.
 *
 * `c.req.url` reflects the internal address the server was reached on, which is
 * wrong behind a proxy or load balancer. When present, `X-Forwarded-Host` and
 * `X-Forwarded-Proto` override the host and protocol so the URL matches what the
 * client actually requested.
 *
 * Prefer {@link Ctx.url}, which caches the result per request.
 */
export function publicUrl(c: Context): URL {
  const url = new URL(c.req.url);
  const forwardedHost = c.req.header('x-forwarded-host');
  if (forwardedHost) {
    url.host = forwardedHost;
    const forwardedProto = c.req.header('x-forwarded-proto');
    if (forwardedProto) url.protocol = forwardedProto;
  }
  return url;
}

/**
 * The environment available to a request: Cloudflare/Workers `Bindings` merged
 * with process env vars. Values not declared in `Bindings` are typed as
 * `string | undefined`. See {@link Ctx.env}.
 */
export type EnvVars<E extends Env> = E['Bindings'] & Record<string, string | undefined>;

/**
 * Ergonomic, read-mostly wrapper around Hono's {@link Context} for use inside
 * server components and server actions.
 *
 * Obtain one with {@link getContext} — never construct it yourself. The same
 * instance is reused for the lifetime of a request, so its lazy getters
 * ({@link Ctx.url}, {@link Ctx.env}) are computed at most once.
 *
 * @typeParam E - The Hono {@link Env} describing this app's `Bindings` and
 *   `Variables`, so {@link Ctx.var} and {@link Ctx.env} stay typed.
 *
 * @example
 * ```tsx
 * import { getContext } from 'rshono/server';
 *
 * export default async function Whoami() {
 *   const ctx = getContext();
 *   const session = ctx.cookies.get('session');
 *   return <p>{ctx.pathname} — {session ?? 'anonymous'}</p>;
 * }
 * ```
 */
export class Ctx<E extends Env = Env> {
  /** The underlying Hono {@link Context}. Escape hatch for anything this wrapper does not expose. */
  readonly raw: Context<E>;

  #url?: URL;
  #env?: EnvVars<E>;

  constructor(c: Context<E>) {
    this.raw = c;
  }

  /** The parsed Hono request (`c.req`) — headers, body parsing, param access, etc. */
  get req(): HonoRequest {
    return this.raw.req;
  }

  /** The browser-facing request URL, proxy-header aware (see {@link publicUrl}). Cached per request. */
  get url(): URL {
    return (this.#url ??= publicUrl(this.raw as Context));
  }

  /** Shorthand for `ctx.url.pathname`, e.g. `/dashboard`. */
  get pathname(): string {
    return this.url.pathname;
  }

  /** Shorthand for `ctx.url.searchParams`, e.g. `ctx.searchParams.get('q')`. */
  get searchParams(): URLSearchParams {
    return this.url.searchParams;
  }

  /** The HTTP method of the request, e.g. `GET` or `POST`. */
  get method(): string {
    return this.raw.req.method;
  }

  /**
   * Matched route params, e.g. `{ id }` for a `/users/[id]` route. Returns an
   * empty object when there is no active route match (rather than throwing).
   */
  get params(): Record<string, string> {
    try {
      return this.raw.req.param();
    } catch {
      return {};
    }
  }

  /**
   * Typed variables set by middleware via `c.set('user', …)`, read here as
   * `ctx.var.user`. Type them by parameterising this class's {@link Env}.
   */
  get var(): Readonly<E['Variables']> {
    return this.raw.var;
  }

  /**
   * Environment for the request: process env vars merged with runtime bindings
   * (bindings win on conflict). Computed once and cached.
   *
   * @example `const key = getContext().env.STRIPE_SECRET_KEY;`
   */
  get env(): EnvVars<E> {
    if (this.#env) return this.#env;
    const nodeEnv = typeof process !== 'undefined' && process.env ? process.env : {};
    const bindings = (this.raw.env as Record<string, unknown> | undefined) ?? {};
    return (this.#env = { ...nodeEnv, ...bindings } as EnvVars<E>);
  }

  /** Sets a response header. Thin pass-through to `c.header(name, value)`. */
  header(name: string, value: string): void {
    this.raw.header(name, value);
  }

  /**
   * Read and write request/response cookies.
   *
   * @example
   * ```ts
   * const ctx = getContext();
   * ctx.cookies.get('session');                       // string | undefined
   * ctx.cookies.set('session', id, { httpOnly: true, sameSite: 'Lax', path: '/' });
   * ctx.cookies.delete('session', { path: '/' });
   * ```
   */
  cookies = {
    /** Reads a single cookie by name, or `undefined` if absent. */
    get: (name: string): string | undefined => getCookie(this.raw, name),
    /** Reads every cookie as a `{ name: value }` record. */
    all: (): Record<string, string> => getCookie(this.raw),
    /** Sets a cookie on the response. See Hono's {@link CookieOptions} for `path`, `httpOnly`, `maxAge`, etc. */
    set: (name: string, value: string, options?: CookieOptions): void => setCookie(this.raw, name, value, options),
    /** Clears a cookie. Pass the same `path`/`domain` it was set with so the browser matches it. */
    delete: (name: string, options?: CookieOptions): void => {
      deleteCookie(this.raw, name, options);
    },
  };
}

/**
 * Returns the {@link Ctx} for the current request.
 *
 * This is the primary entry point for reading request data from a server
 * component or server action — the URL, cookies, params, env, and middleware
 * variables. The returned wrapper is memoised per request, so repeated calls in
 * the same request are cheap and return the same instance.
 *
 * @typeParam E - The app's Hono {@link Env}, to type {@link Ctx.var} and {@link Ctx.env}.
 * @throws If called at module load, where there is no ambient context to resolve.
 * @throws If called while prerendering a `kind: 'static'` route, which has no
 *   per-request context at build time — mark the route `dynamic` instead.
 *
 * @example
 * ```ts
 * 'use server';
 * import { getContext, redirect } from 'rshono/server';
 *
 * export async function login(form: FormData) {
 *   getContext().cookies.set('session', String(form.get('email')), { httpOnly: true });
 *   redirect('/dashboard');
 * }
 * ```
 */
export function getContext<E extends Env = Env>(): Ctx<E> {
  if (isPrerendering()) {
    throw new Error(
      "[rshono] getContext() was called while prerendering a `kind: 'static'` route. A static page " +
        'is rendered once at build time, so it has no per-request context to read (URL, cookies, ' +
        "headers, env). Change this route to `kind: 'dynamic'` so it renders per request, or remove " +
        'the getContext() call.',
    );
  }
  const c = store.getStore();
  if (!c) {
    throw new Error(
      '[rshono] getContext() was called outside a request. It only works inside a server component or a server action, not at module load.',
    );
  }
  let ctx = wrappers.get(c);
  if (!ctx) {
    ctx = new Ctx(c);
    wrappers.set(c, ctx);
  }
  return ctx as unknown as Ctx<E>;
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
 * const session = getContext().cookies.get('session');
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
 * const user = await db.user.find(getContext().params.id);
 * if (!user) notFound();
 * return <Profile user={user} />; // user is non-null here
 * ```
 */
export function notFound(): never {
  throw new NotFoundSignal();
}
