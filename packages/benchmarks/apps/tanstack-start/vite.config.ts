import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import rsc from '@vitejs/plugin-rsc';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tanstackStart({
      // APP_SPEC.md: `/` is prerendered in all three apps; `/ssr` and `/interactive` must stay
      // dynamic. So prerendering is declared per page, not globally — enabling it at the top level
      // would turn the two dynamic routes into static files. `crawlLinks: false` is load-bearing for
      // the same reason: the nav links to both, and the crawler follows them by default.
      pages: [{ path: '/', prerender: { enabled: true, crawlLinks: false } }],
      // APP_SPEC.md: the two dynamic routes render their body as a server component, so the flight
      // encode/decode round trip is on the request path here as it is in the other two apps.
      // TanStack's RSC is opt-in per boundary rather than whole-document — see the note in
      // ../../README.md about what that does and does not make comparable.
      rsc: {
        enabled: true,
      },
    }),
    rsc(),
    viteReact(),
  ],
  // Rule 4: the harness compresses every target's bytes itself, identically.
  build: { reportCompressedSize: false },
});
