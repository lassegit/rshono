import { defineConfig } from 'rshono';

// Every option is optional — this file mostly restates the defaults as living documentation.
export default defineConfig({
  // Server
  siteUrl: 'https://rshono.example', // public origin, baked into prerendered pages' absolute URLs
  port: 3000, // a --port flag or PORT env var still wins

  // Security & limits
  trustProxy: false, // honour X-Forwarded-Host/-Proto — only behind a proxy you control
  checkOrigin: true, // reject cross-origin server-action POSTs
  allowedOrigins: [], // extra origins allowed to post actions, e.g. 'https://admin.example.com'
  csp: false, // set true for a strict per-request-nonce Content-Security-Policy
  cspDirectives: {}, // widen it, e.g. { 'img-src': "'self' https://cdn.example.com" }
  bodySizeLimit: '1mb', // '512kb' | 4_000_000 | false to disable; applies to every route
  renderTimeout: 10_000, // ms deadline for a request (server action + flight + SSR)
  compress: true, // gzip compressible responses; false behind a proxy that already does it

  // Build — mutate the generated Rspack config just before it compiles
  rspack(config) {
    return config;
  },
});
