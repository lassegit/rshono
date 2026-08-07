import { defineConfig } from '@rshono/core';

/**
 * Every field is optional — delete this file to accept all the defaults. The commented lines are the
 * defaults, kept as documentation of what is there to change.
 *
 * `trustProxy` is compiled into the server bundle at build time, so changing it means a rebuild; there
 * is no env-var interface for it. The port and bind address are not settings at all — they are
 * `--port` / `PORT` and `HOST`. Per-request security (CSRF, CSP, the body cap) is Hono middleware in
 * `src/server.ts`, not config.
 */
export default defineConfig({
  /** Where `build` targets. Overridable per build with `--deploy` or `RSHONO_DEPLOY`. */
  deploy: 'cloudflare',

  /**
   * Nearly every page here is `render: 'static'`, and they all emit a canonical tag — so this is load
   * bearing rather than decorative. Without it the build warns and every canonical points at localhost.
   */
  siteUrl: 'https://www.rshono.com',

  // trustProxy: false,   // honour X-Forwarded-Host/-Proto — only behind a proxy you control

  rspack(config) {
    /**
     * Tailwind, and the only thing the build needs to know about it.
     *
     * Rspack compiles CSS natively, which is fast and is all a plain stylesheet needs — but that parser
     * reads *finished* CSS, and `@import 'tailwindcss'`, `@theme` and `@apply` are not that. Tailwind is
     * a PostCSS plugin, so it has to run in front of the parser, which is what this rule does. The
     * plugin list itself is in `postcss.config.mjs`, where postcss-loader looks for it.
     *
     * Keep `type: 'css/auto'` rather than `'css'`, or `*.module.css` stops being a CSS module.
     */
    config.module!.rules!.push({ test: /\.css$/i, use: ['postcss-loader'], type: 'css/auto' });

    /**
     * Documentation pages are markdown files imported as strings, so the content is *in* the server
     * bundle rather than read off disk at request time.
     *
     * That is what lets `/docs/:slug.md` — a dynamic endpoint route — answer on a target with no
     * filesystem (`cloudflare`), and it keeps the prerender honest: the same bytes the build parsed into
     * HTML are the bytes the markdown endpoint serves.
     */
    config.module!.rules!.push({ test: /\.md$/i, type: 'asset/source' });
  },
});
