import type { PageProps } from 'rshono';

export default function Home({ url, ctx }: PageProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>minimal app</title>
      </head>
      <body>
        <h1 data-page="home">Minimal app</h1>
        {/* The `url` prop is a real URL, so pathname and query come off it — no second copy in the props. */}
        <p data-url={url.href} data-pathname={url.pathname} data-query={url.searchParams.get('q') ?? '(none)'}>
          No server.ts, no public/, no config, no special pages.
        </p>
        {/* The `ctx` prop needs no config and no import — it works in the smallest app there is. */}
        <p data-ctx-cookie={ctx.cookies.get('probe') ?? '(none)'} data-ctx-method={ctx.method} />
      </body>
    </html>
  );
}
