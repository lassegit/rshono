import { Assets } from 'rs-hono';
import type { ReactNode } from 'react';
// Bundled by Rspack (merged, minified, content-hashed) and linked via
// <Assets/> below — inert on the server. Global CSS can be imported from
// any component; it all ends up in the same stylesheet.
import '../styles.css';

interface LayoutProps {
    /** Document title — every page passes its own. */
    title?: string;
    /** Rendered as <meta name="description"> when provided. */
    description?: string;
    children: ReactNode;
}

/**
 * Application layout — owns the ENTIRE document, <html> included.
 * This is NOT auto-discovered by the framework. Pages import and use it
 * directly (React composition), so title, description or any other head
 * tag is an ordinary prop — no head-manager API. The framework streams
 * whatever the page renders (React adds <!DOCTYPE html> for the <html>
 * tag) and appends its hydration scripts to <body>. One-off tags
 * rendered deeper in the tree (<meta>, <link>) are hoisted into <head>
 * by React 19.
 */
export function Layout({ title = 'rs-hono', description, children }: LayoutProps) {
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
                <Assets />
            </head>
            <body>
                <header>
                    <nav>
                        <a href="/" className="logo">
                            <strong>rs-hono</strong>
                        </a>
                        <div className="nav-links">
                            <a href="/">Home</a>
                            <a href="/users">Users</a>
                            <a href="/signup">Sign Up</a>
                        </div>
                    </nav>
                </header>

                <main>{children}</main>

                <footer>
                    <p>
                        Built with <a href="https://github.com/example/rs-hono">rs-hono</a> — Hono + Rspack
                    </p>
                </footer>
            </body>
        </html>
    );
}
