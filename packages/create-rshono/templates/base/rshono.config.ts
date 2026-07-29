import { defineConfig } from 'rshono';

/**
 * Every field is optional — delete this file to accept all the defaults. The commented lines are the
 * defaults, kept as documentation of what is there to change.
 *
 * The framework settings are compiled into the server bundle at build time, so changing one means a
 * rebuild; there is no env-var interface for them. `--port`/`PORT` and `HOST` are the two exceptions,
 * and they win over what is written here.
 */
export default defineConfig({
  /** Where `build` targets. Overridable per build with `--deploy` or `RSHONO_DEPLOY`. */
  deploy: '__DEPLOY_TARGET__',

  // The public origin, baked into prerendered pages' absolute URLs. Set it if you use `render: 'static'`
  // and build canonical tags, `og:url` or absolute links — there is no request to read a Host from.
  // siteUrl: 'https://example.com',

  // port: 3000,          // default for dev/start
  // host: '0.0.0.0',     // bind address for start

  // trustProxy: false,   // honour X-Forwarded-Host/-Proto — only behind a proxy you control
  // checkOrigin: true,   // CSRF origin check on server-action POSTs
  // allowedOrigins: [],  // extra origins allowed to post actions
  // csp: false,          // strict per-request-nonce Content-Security-Policy
  // cspDirectives: {},   // widen it, e.g. { 'img-src': "'self' https://cdn.example.com" }
  // bodySizeLimit: '1mb',// request body cap before a 413; false disables it
  // renderTimeout: 10_000, // ms deadline for a request (action + flight + SSR)
  // compress: true,      // gzip; turn off behind a proxy that already does it

  // Escape hatch: mutate the generated Rspack config just before it compiles. Called once per compiler.
  // rspack(config, { isServer, isDev }) {
  //   return config;
  // },
});
