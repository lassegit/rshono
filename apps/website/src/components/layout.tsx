import { NavigationProgress } from '@rshono/core/client';
import type { ReactNode } from 'react';
import '../styles.css';
import { Logo } from './logo';

const GITHUB_URL = 'https://github.com/rshono/rshono';

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
          <a href={GITHUB_URL} data-native className="text-zinc-600 no-underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/@rshono/core"
            data-native
            className="hidden text-zinc-600 no-underline hover:text-zinc-900 sm:inline dark:text-zinc-400 dark:hover:text-white"
          >
            npm
          </a>
        </nav>

        <code className="ml-auto hidden rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 md:block dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          npx @rshono/create@latest my-app
        </code>
      </div>
    </header>
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
