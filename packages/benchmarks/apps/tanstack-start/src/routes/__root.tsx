import type { ReactNode } from 'react';
import { createRootRoute, HeadContent, Link, Scripts } from '@tanstack/react-router';
import appCss from '../styles.css?url';

/**
 * Nav uses TanStack's `<Link>` for client-side navigation — the counterpart to `next/link` and to
 * rshono's plain `<a href>`, which its runtime soft-navigates on its own.
 */
export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Benchmark Suite' }],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <strong>Benchmark Suite</strong>
            <Link to="/">Home</Link>
            <Link to="/ssr">SSR</Link>
            <Link to="/interactive">Interactive</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>TanStack Start — TanStack Router + Vite.</p>
        </footer>
        <Scripts />
      </body>
    </html>
  );
}
