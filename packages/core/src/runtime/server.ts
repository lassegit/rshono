/**
 * `@rshono/core/server` — the request-scoped surface, for use inside server components
 * and `'use server'` action modules: `getRequestContext()` for the URL, cookies,
 * params, env and middleware variables, the `redirect()` and `notFound()`
 * control-flow helpers, and `onServerError()` for reporting the errors the
 * framework catches.
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

// A barrel rather than `./context.js` itself, which is where all of this is implemented: that module
// also exports the plumbing the framework's own entry points need (`runWithContext`, `readParams`,
// `publicUrl`, `reportServerError`), and pointing the `./server` subpath straight at it published
// every one of them — `@internal` in the docs, but present in a consumer's autocomplete and pinned
// by semver all the same. They stay reachable by relative import, which is the only way the
// framework itself ever reaches them.
export {
  getRequestContext,
  notFound,
  onServerError,
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
