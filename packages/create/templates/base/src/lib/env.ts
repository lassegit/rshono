/**
 * Environment access in one place, on the right side of the client/server line.
 *
 * The boundary is the RSC directives, not filenames. In a `'use client'` module — and in its SSR pass —
 * `process.env` is replaced at build time with a literal holding `NODE_ENV` and the `PUBLIC_`-prefixed
 * variables only, so a secret read there compiles to `undefined` and cannot ship. Server components and
 * `'use server'` actions read the real environment.
 */

/** Safe anywhere: `PUBLIC_` variables are the ones compiled into the browser bundle. */
export const publicEnv = {
  appName: process.env.PUBLIC_APP_NAME ?? '{{PROJECT_NAME}}',
};

/**
 * Server-only. Throws rather than handing back `undefined`, so a missing secret fails at the point of
 * use with a name in the message instead of turning into a confusing error further down.
 *
 * Calling this from a client component would always throw — that view of `process.env` holds nothing but
 * `NODE_ENV` and the `PUBLIC_` set. Read secrets in server code and pass derived values down as props.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} — add it to .env.local`);
  return value;
}
