import type { ReactNode } from "react";

/**
 * Application layout — used by page components.
 * This is NOT auto-discovered by the framework. Pages import
 * and use it directly (React composition).
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
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
          Built with{" "}
          <a href="https://github.com/example/rs-hono">rs-hono</a> — Hono +
          Rspack
        </p>
      </footer>
    </>
  );
}
