import type { Handler } from '@rshono/core';

// An endpoint that always throws, to exercise the framework's uncaught-error path: anything that
// escapes a handler reaches Hono's onError, which renders the `error` page from routes.ts as HTML or
// as a flight payload depending on what the client asked for — with the real message redacted in
// production. Nothing here is fit for a real app; it exists so the tests have an honest 500.
export const handler: Handler = () => {
  throw new Error('Intentional endpoint failure');
};
