/**
 * `rshono/server` — the request-scoped surface, for use inside server components
 * and `'use server'` action modules: {@link getContext} for the URL, cookies,
 * params, env and middleware variables, the {@link redirect} and {@link notFound}
 * control-flow helpers, and {@link onServerError} for reporting the errors the
 * framework catches.
 *
 * Server-only. Importing this from a `'use client'` module is a mistake — those
 * run in the browser (and are SSR'd without a bound context). Read what you need
 * on the server and pass it down as props, or use `useNavigation()` from
 * `rshono/client` for URL data.
 *
 * A barrel rather than `./context.js` itself, which is where all of this is
 * implemented: that module also exports the plumbing the framework's own entry
 * points need (`runWithContext`, `readParams`, `publicUrl`, `reportServerError`),
 * and pointing the `./server` subpath straight at it published every one of them —
 * `@internal` in the docs, but present in a consumer's autocomplete and pinned by
 * semver all the same. They stay reachable by relative import, which is the only
 * way the framework itself ever reaches them.
 *
 * @packageDocumentation
 */

export {
  getContext,
  notFound,
  onServerError,
  redirect,
  // A type, not a value: `Ctx` is handed to you by `getContext()` or the `ctx` page
  // prop — one instance per request — and is never constructed by application code.
  type Ctx,
  type EnvVars,
  type RedirectStatus,
  type ServerErrorContext,
  type ServerErrorHandler,
  type ServerErrorSource,
} from './context.js';
