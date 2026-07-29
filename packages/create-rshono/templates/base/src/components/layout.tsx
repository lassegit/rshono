import type { ReactNode } from 'react';
import { NavigationProgress } from 'rshono/client';
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
      <body>
        {/* Paints during a soft navigation, so a slow page still feels answered. */}
        <NavigationProgress />
        <header>
          <nav>
            <a href="/">
              <strong>{publicEnv.appName}</strong>
            </a>
            {/* `data-prefetch` warms a page on hover; `data-native` opts a link out of soft navigation. */}
            <a href="/api/health" data-native>
              /api/health
            </a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>
            Built with <a href="https://github.com/lassegit/rshono">rshono</a> — Hono + Rspack + React Server Components.
          </p>
        </footer>
      </body>
    </html>
  );
}
