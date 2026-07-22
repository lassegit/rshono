import type { Context, Env, HonoRequest } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import { AsyncLocalStorage } from 'node:async_hooks';
import { NotFoundSignal, RedirectSignal } from './control.js';

export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

const store = new AsyncLocalStorage<Context>();

const wrappers = new WeakMap<Context, Ctx>();

export function runWithContext<T>(c: Context, fn: () => T): T {
  return store.run(c, fn);
}

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

export type EnvVars<E extends Env> = E['Bindings'] & Record<string, string | undefined>;

export class Ctx<E extends Env = Env> {
  readonly raw: Context<E>;

  #url?: URL;
  #env?: EnvVars<E>;

  constructor(c: Context<E>) {
    this.raw = c;
  }

  get req(): HonoRequest {
    return this.raw.req;
  }

  get url(): URL {
    return (this.#url ??= publicUrl(this.raw as Context));
  }

  get pathname(): string {
    return this.url.pathname;
  }

  get searchParams(): URLSearchParams {
    return this.url.searchParams;
  }

  get method(): string {
    return this.raw.req.method;
  }

  get params(): Record<string, string> {
    try {
      return this.raw.req.param();
    } catch {
      return {};
    }
  }

  // @HC Typed variables provided by middleware (`c.set('user', …)` → `ctx.var.user`).
  get var(): Readonly<E['Variables']> {
    return this.raw.var;
  }

  get env(): EnvVars<E> {
    if (this.#env) return this.#env;
    const nodeEnv = typeof process !== 'undefined' && process.env ? process.env : {};
    const bindings = (this.raw.env as Record<string, unknown> | undefined) ?? {};
    return (this.#env = { ...nodeEnv, ...bindings } as EnvVars<E>);
  }

  header(name: string, value: string): void {
    this.raw.header(name, value);
  }

  cookies = {
    get: (name: string): string | undefined => getCookie(this.raw, name),
    all: (): Record<string, string> => getCookie(this.raw),
    set: (name: string, value: string, options?: CookieOptions): void => setCookie(this.raw, name, value, options),
    delete: (name: string, options?: CookieOptions): void => {
      deleteCookie(this.raw, name, options);
    },
  };
}

export function getContext<E extends Env = Env>(): Ctx<E> {
  const c = store.getStore();
  if (!c) {
    throw new Error(
      '[rshono] getContext() was called outside a request. It only works inside a server component or a server action (not at module load, and not during static prerendering).',
    );
  }
  let ctx = wrappers.get(c);
  if (!ctx) {
    ctx = new Ctx(c);
    wrappers.set(c, ctx);
  }
  return ctx as unknown as Ctx<E>;
}

export function redirect(location: string, status: RedirectStatus = 303): never {
  throw new RedirectSignal(location, status);
}

export function notFound(): never {
  throw new NotFoundSignal();
}
