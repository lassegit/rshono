import type { ReactNode } from 'react';
import '../styles.css';

/**
 * rshono pages render the whole document. The nav uses plain `<a href>`, which the runtime turns into
 * a soft navigation on its own — the counterpart to `next/link` and TanStack's `<Link>` in the other
 * two apps. Same user-visible behaviour, each framework's idiomatic way of getting it.
 */
export function Layout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
      </head>
      <body>
        <header>
          <nav>
            <strong>Benchmark Suite</strong>
            <a href="/">Home</a>
            <a href="/ssr">SSR</a>
            <a href="/interactive">Interactive</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>rshono — Hono + Rspack + React Server Components.</p>
        </footer>
      </body>
    </html>
  );
}
