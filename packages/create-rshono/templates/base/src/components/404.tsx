import type { PageProps } from '@rshono/core';
import { Layout } from './layout';

/** Declared as `notFound` in routes.ts. Answers unmatched paths, and any `notFound()` call, with a 404. */
export default function NotFound({ url }: PageProps) {
  return (
    <Layout title="Not found">
      <h1>404</h1>
      <p>
        Nothing at <code>{url.pathname}</code>.
      </p>
      <p>
        <a href="/">Back home</a>
      </p>
    </Layout>
  );
}
