import { defineConfig } from '@rshono/core';

// Every option is optional — this file mostly restates the defaults as living documentation.
export default defineConfig({
  // Server
  deploy: 'node', // where `build` targets: node | cloudflare | vercel | aws-lambda
  siteUrl: 'https://rshono.example', // public origin, baked into prerendered pages' absolute URLs

  // Security & limits
  trustProxy: false, // honour X-Forwarded-Host/-Proto — only behind a proxy you control
  checkOrigin: true, // reject cross-origin server-action POSTs
  allowedOrigins: [], // extra origins allowed to post actions, e.g. 'https://admin.example.com'
  csp: false, // set true for a strict per-request-nonce Content-Security-Policy
  cspDirectives: {}, // widen it, e.g. { 'img-src': "'self' https://cdn.example.com" }
  bodySizeLimit: '1mb', // '512kb' | 4_000_000 | false to disable; applies to every route

  // Build — mutate the generated Rspack config just before it compiles
  rspack(config) {
    return config;
  },
});
