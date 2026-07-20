/**
 * Shared document shell — a plain server component that owns the whole
 * <html> document. Pages import it and pass their content as children.
 * The CSS import is picked up per page via the 'use server-entry'
 * asset tracking.
 */
import type { ReactNode } from 'react';
import '../styles.css';

export function Layout({ title = 'rshono', description, children }: { title?: string; description?: string; children: ReactNode }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>{title}</title>
                {description && <meta name="description" content={description} />}
                <link
                    rel="icon"
                    href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>"
                />
            </head>
            <body>
                <header>
                    <nav>
                        <a href="/" className="logo">
                            <strong>rshono</strong>
                        </a>
                        <div className="nav-links">
                            <a href="/">Home</a>
                            <a href="/users">Users</a>
                            <a href="/docs/getting-started">Docs</a>
                            <a href="/signup">Sign Up</a>
                        </div>
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
