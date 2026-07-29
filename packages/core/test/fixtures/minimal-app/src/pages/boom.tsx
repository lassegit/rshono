import type { PageProps } from '@rshono/core';

// There is no `error` page in this app's routes.ts, so this exercises the framework's own
// last-resort 500 rather than a user-supplied error page.
export default function Boom(_props: PageProps) {
  throw new Error('minimal app blew up on purpose');
}
