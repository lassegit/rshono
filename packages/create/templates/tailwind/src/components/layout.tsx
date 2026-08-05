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
      <body className="bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <header className="mx-auto max-w-2xl px-6 py-5">
          <nav className="flex items-center justify-between gap-4">
            <a href="/" className="font-semibold no-underline">
              {appName}
            </a>
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
