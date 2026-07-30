import { NavigationProgress } from '@rshono/core/client';
import type { ReactNode } from 'react';
import '../styles.css';
import { Logo } from './logo';

const GITHUB_URL = 'https://github.com/rshono/rshono';
const NPM_URL = 'https://www.npmjs.com/package/@rshono/core';

/**
 * A page renders the whole document, so the shell lives in one component every page wraps its content
 * in. Importing the stylesheet here is what attaches it to each of those pages.
 *
 * `canonical` is passed rather than derived from the page's `url`, because every page here is
 * prerendered — that prop is the build-time URL, and it is only the right one because `siteUrl` is set
 * in `rshono.config.ts`. Passing it keeps the dependency visible at the call site.
 */
export function Layout({
  title,
  description,
  canonical,
  wide = false,
  children,
}: {
  title?: string;
  description?: string;
  canonical?: string;
  /** Docs pages manage their own three-column width; everything else gets the centred column. */
  wide?: boolean;
  children: ReactNode;
}) {
  const heading = title ? `${title} · rshono` : 'rshono — Hono + Rspack + React Server Components';

  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{heading}</title>
        {description && <meta name="description" content={description} />}
        {canonical && <link rel="canonical" href={canonical} />}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta property="og:title" content={heading} />
        {description && <meta property="og:description" content={description} />}
        {canonical && <meta property="og:url" content={canonical} />}
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        {/* Both themes are real here, so the browser should style its own chrome for whichever is active. */}
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="bg-white text-zinc-700 antialiased dark:bg-zinc-950 dark:text-zinc-300">
        {/* Paints during a soft navigation, so a slow page still feels answered. */}
        <NavigationProgress />
        <SkipLink />
        <SiteHeader />
        <main id="content" className={wide ? '' : 'mx-auto w-full max-w-3xl px-6 py-16'}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

/**
 * Visible only once focused. The docs sidebar is a long list of links, so without this a keyboard user
 * tabs through every one of them on every page before reaching the prose.
 */
function SkipLink() {
  return (
    <a
      href="#content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:ring-2 focus:ring-sky-500 dark:focus:bg-zinc-900"
    >
      Skip to content
    </a>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/85 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-6">
        <a href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-zinc-900 no-underline dark:text-white">
          <Logo />
          rshono
        </a>

        <nav className="flex items-center gap-5 text-sm" aria-label="Main">
          {/* `data-prefetch` warms a page on hover; `data-native` opts a link out of soft navigation. */}
          <a
            href="/docs/getting-started"
            data-prefetch
            className="text-zinc-600 no-underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            Docs
          </a>
          <a href="/comparison" data-prefetch className="text-zinc-600 no-underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
            Compare
          </a>
          <a href="/benchmarks" data-prefetch className="text-zinc-600 no-underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
            Benchmarks
          </a>
        </nav>

        {/* Everything from here sits against the right edge. */}
        <div className="ml-auto flex items-center gap-4">
          <code className="hidden rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 md:block dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            npx @rshono/create@latest my-app
          </code>

          {/*
            Off-site links, as marks rather than words — they are the two logos every reader already
            recognises, and spelling them out earns nothing next to the wordmark on the left.

            Icon-only means the link has no text to name it, so each carries an `aria-label` (what a
            screen reader announces) and a `title` (what a pointer user sees on hover). The `<svg>`
            itself is `aria-hidden`, or the accessible name would be read twice. Padding rather than a
            larger glyph gives them a tap target worth aiming at.
          */}
          <nav className="flex items-center gap-1" aria-label="Project links">
            <a
              href={GITHUB_URL}
              data-native
              aria-label="rshono on GitHub"
              title="GitHub"
              className="rounded-md p-2 text-zinc-500 no-underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            >
              <GitHubMark />
            </a>
            <a
              href={NPM_URL}
              data-native
              aria-label="@rshono/core on npm"
              title="npm"
              className="rounded-md p-2 text-zinc-500 no-underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            >
              <NpmMark />
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}

function GitHubMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function NpmMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
    </svg>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-2">
          <Logo size={16} />
          rshono
        </span>
        <span>
          Built with rshono — <a href="/docs/how-it-works">how that works</a>.
        </span>
        <span className="ml-auto flex gap-5">
          <a href={GITHUB_URL} data-native>
            GitHub
          </a>
          <a href={`${GITHUB_URL}/issues`} data-native>
            Issues
          </a>
          <a href="/llms.txt" data-native>
            llms.txt
          </a>
        </span>
      </div>
    </footer>
  );
}
