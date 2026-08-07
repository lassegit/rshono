import { defineConfig } from '@rshono/core';

// Every option is optional — this file mostly restates the defaults as living documentation.
// It is deliberately short: it holds only what the *build* decides. The per-request security
// controls (CSRF, CSP, the body cap) are Hono middleware in `src/server.ts`.
export default defineConfig({
  // Server
  deploy: 'node', // where `build` targets: node | cloudflare | vercel | aws-lambda
  siteUrl: 'https://rshono.example', // public origin, baked into prerendered pages' absolute URLs

  // Security
  trustProxy: false, // honour X-Forwarded-Host/-Proto — only behind a proxy you control

  // Build — mutate the generated Rspack config just before it compiles
  rspack(config) {
    return config;
  },
});
