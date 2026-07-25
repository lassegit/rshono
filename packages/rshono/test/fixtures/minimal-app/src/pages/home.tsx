import type { PageProps } from 'rshono';

export default function Home({ url }: PageProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>minimal app</title>
      </head>
      <body>
        <h1 data-page="home">Minimal app</h1>
        <p data-url={url}>No server.ts, no public/, no config, no special pages.</p>
      </body>
    </html>
  );
}
