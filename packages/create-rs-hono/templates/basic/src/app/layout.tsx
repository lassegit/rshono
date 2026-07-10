import type { ReactNode } from "react";

/**
 * Application layout — owns the entire document, <html> included.
 * Pages import and compose it directly; there is no auto-discovery.
 * Head tags are ordinary props/JSX: pass `title`, or render <meta>/<link>
 * anywhere in a page and React 19 hoists them into <head>. The framework
 * appends its hydration scripts to <body> automatically.
 */
export function Layout({
  title = "rs-hono app",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="stylesheet" href="/_static/styles.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
