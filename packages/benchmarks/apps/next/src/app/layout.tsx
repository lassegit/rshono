import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export const metadata = { title: 'Benchmark Suite' };

/**
 * Nav uses `next/link` for client-side navigation — the counterpart to TanStack's `<Link>` and to
 * rshono's plain `<a href>`, which its runtime soft-navigates on its own. Same user-visible
 * behaviour, each framework's idiomatic way of getting it.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <nav>
            <strong>Benchmark Suite</strong>
            <Link href="/">Home</Link>
            <Link href="/ssr">SSR</Link>
            <Link href="/interactive">Interactive</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>Next.js — App Router with React Server Components.</p>
        </footer>
      </body>
    </html>
  );
}
