/**
 * `@rshono/core/server` — the request-scoped surface, for use inside server components
 * and `'use server'` action modules: `getRequestContext()` for the URL, cookies,
 * params, env and middleware variables, the `redirect()` and `notFound()`
 * control-flow helpers, and `onServerError()` for reporting the errors the
 * framework catches. Plus `publicUrl(c)`, for middleware in `src/server.ts`, which
 * is handed Hono's `c` rather than a request context.
 *
 * Server-only. Importing this from a `'use client'` module is a mistake — those
 * run in the browser (and are SSR'd without a bound context). Read what you need
 * on the server and pass it down as props, or use `useNavigation()` from
 * `@rshono/core/client` for URL data.
 *
 * @see {@link https://www.rshono.com/docs/api#rshonocoreserver | Docs — `@rshono/core/server`}
 *
 * @packageDocumentation
 */

// A barrel rather than pointing the `./server` subpath straight at `./context.js`, where all of this
// is implemented: that module also exports the framework's own plumbing (`runWithContext`,
// `readParams`, `reportServerError`), and exposing it would put every one of those in a consumer's
// autocomplete and under semver. They stay reachable by relative import.
export {
  getRequestContext,
  notFound,
  onServerError,
  // For middleware, which is handed Hono's `c` and so has no request context to read a URL from.
  // Hono's own middleware all resolve the origin from `c.req.url`, which is the internal address
  // behind a proxy — this is what `trustProxy` means to them.
  publicUrl,
  redirect,
  type EnvVars,
  type RedirectStatus,
  // A type, not a value: `RequestContext` is handed to you by `getRequestContext()` or the `ctx` page
  // prop — one instance per request — and is never constructed by application code.
  type RequestContext,
  type ServerErrorContext,
  type ServerErrorHandler,
  type ServerErrorSource,
} from './context.js';
