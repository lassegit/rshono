/**
 * The env object shared code is allowed to see — on BOTH sides of the
 * SSR/hydration boundary. The client bundle inlines it via DefinePlugin
 * (rspack-config.ts); env-hooks.mjs injects the same object into shared
 * modules on the server. Only PUBLIC_-prefixed variables (plus NODE_ENV)
 * pass the filter, so nothing else can reach a browser.
 */
export function publicEnv(isDev: boolean): Record<string, string> {
    const entries = Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[0].startsWith('PUBLIC_') && entry[1] !== undefined,
    );
    return { NODE_ENV: isDev ? 'development' : 'production', ...Object.fromEntries(entries) };
}
