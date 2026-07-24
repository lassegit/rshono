import { defineConfig } from 'rshono';

// Every option is optional — this file mostly restates the defaults as living documentation.
export default defineConfig({
  // Server
  port: 3000, // a --port flag or PORT env var still wins

  // Security & limits
  checkOrigin: true, // reject cross-origin server-action POSTs
  allowedOrigins: [], // extra origins allowed to post actions, e.g. 'https://admin.example.com'
  csp: false, // set true for a strict per-request-nonce Content-Security-Policy
  bodySizeLimit: '1mb', // '512kb' | 4_000_000 | false to disable
  renderTimeout: 10_000, // ms deadline for a page render (flight + SSR)

  // Build — mutate the generated Rspack config just before it compiles
  rspack(config) {
    return config;
  },
});
