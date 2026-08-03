import { NavigationProgress } from '@rshono/core/client';
import type { ReactNode } from 'react';
import { publicEnv } from '../lib/env';
import '../styles.css';

/**
 * A page renders the whole document, so the shell lives in one component every page wraps its content
 * in. Importing the stylesheet here is what attaches it to each of those pages.
 */
export function Layout({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  const heading = title ? `${title} · ${publicEnv.appName}` : publicEnv.appName;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{heading}</title>
        {description && <meta name="description" content={description} />}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        {/* Paints during a soft navigation, so a slow page still feels answered. */}
        <NavigationProgress />
        <header className="mx-auto max-w-2xl px-6 py-5">
          <nav className="flex items-center justify-between gap-4">
            <a href="/" className="font-semibold no-underline">
              {publicEnv.appName}
            </a>
            {/* `data-native` opts a link out of soft navigation and does a full browser load. */}
            <a href="/api/health" data-native className="text-sm">
              /api/health
            </a>
          </nav>
        </header>
        <main className="mx-auto max-w-2xl px-6 pt-4 pb-16">{children}</main>
        <footer className="mx-auto max-w-2xl border-t border-zinc-200 px-6 py-8 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <p>
            Built with <a href="https://github.com/rshono/rshono">rshono</a> — Hono + Rspack + React Server Components.
          </p>
        </footer>
      </body>
    </html>
  );
}
