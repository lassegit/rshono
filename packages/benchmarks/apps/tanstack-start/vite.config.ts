import { defineConfig } from 'vite';
import viteReact from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';

export default defineConfig({
  plugins: [
    tanstackStart({
      // APP_SPEC.md: `/` is prerendered in all three apps; `/ssr` and `/interactive` must stay
      // dynamic. Prerendering is therefore declared per page and left off globally — enabling it at
      // the top level prerenders every route in the tree, which would turn the two dynamic routes
      // into static files and make their numbers meaningless.
      // `crawlLinks: false` is load-bearing: the nav links to both dynamic routes, and the crawler
      // follows them by default — which prerenders the two routes whose whole purpose is to be
      // rendered per request.
      pages: [{ path: '/', prerender: { enabled: true, crawlLinks: false } }],
    }),
    viteReact(),
  ],
  // Rule 4: the harness compresses every target's bytes itself, identically.
  build: { reportCompressedSize: false },
});
