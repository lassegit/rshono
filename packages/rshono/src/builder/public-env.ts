/**
 * The env object client code is allowed to see. The client bundle inlines
 * it via DefinePlugin (rspack-config.ts): only PUBLIC_-prefixed variables
 * (plus NODE_ENV) pass the filter, so nothing else can reach a browser.
 *
 * Server code — server components, endpoint handlers, the Hono sub-app —
 * keeps the real process.env: it never ships to the client, only its
 * rendered output does.
 */
export function publicEnv(isDev: boolean): Record<string, string> {
  const entries = Object.entries(process.env).filter((entry): entry is [string, string] => entry[0].startsWith('PUBLIC_') && entry[1] !== undefined);
  return { NODE_ENV: isDev ? 'development' : 'production', ...Object.fromEntries(entries) };
}
