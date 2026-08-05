import type { ReactNode } from 'react';
import '../styles.css';

export const appName = process.env.PUBLIC_APP_NAME ?? '{{PROJECT_NAME}}';

export function Layout({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  const heading = title ? `${title} · ${appName}` : appName;

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
        <header>
          <nav>
            <a href="/">
              <strong>{appName}</strong>
            </a>
            <a href="/api/health" data-native>
              /api/health
            </a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>
            Built with <a href="https://github.com/rshono/rshono">rshono</a> — Hono + Rspack + React Server Components.
          </p>
        </footer>
      </body>
    </html>
  );
}
