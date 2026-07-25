import type { PageProps } from 'rshono';

export default function Wildcard({ url }: PageProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>wildcard</title>
      </head>
      <body>
        <h1 data-page="wildcard">Wildcard</h1>
        <p data-path={new URL(url).pathname}>Matched by /files/*</p>
      </body>
    </html>
  );
}
