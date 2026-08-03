import { defineConfig } from '@rshono/core';

/**
 * Every field is optional — delete this file to accept all the defaults. The commented lines are the
 * defaults, kept as documentation of what is there to change.
 *
 * The framework settings are compiled into the server bundle at build time, so changing one means a
 * rebuild; there is no env-var interface for them. The port and bind address are not settings at all —
 * they are `--port` / `PORT` and `HOST`.
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
  // checkOrigin: true,   // CSRF origin check on server-action POSTs
  // allowedOrigins: [],  // extra origins allowed to post actions
  // csp: false,          // strict per-request-nonce Content-Security-Policy
  // cspDirectives: {},   // widen it, e.g. { 'img-src': "'self' https://cdn.example.com" }
  // bodySizeLimit: '1mb',// request body cap before a 413; false disables it

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
