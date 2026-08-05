import type { PageProps } from '@rshono/core';
import { Layout } from './layout';

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
