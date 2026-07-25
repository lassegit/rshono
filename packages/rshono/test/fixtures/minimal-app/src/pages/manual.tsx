'use server-entry';

import type { PageProps } from 'rshono';

// Reached through a variable in routes.ts, so the directive above is the only thing attaching this
// page's client assets. Without it the framework throws its "missing client-asset info" error.
export default function Manual(_props: PageProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>manual directive</title>
      </head>
      <body>
        <h1 data-page="manual">Hand-written directive</h1>
      </body>
    </html>
  );
}
