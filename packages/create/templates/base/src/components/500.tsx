import type { ErrorPageProps } from '@rshono/core';
import { Layout } from './layout';

export default function ServerError({ error }: ErrorPageProps) {
  return (
    <Layout title="Something went wrong">
      <h1>500</h1>
      <p>{error.message}</p>
      {error.stack && <pre>{error.stack}</pre>}
      <p>
        <a href="/">Back home</a>
      </p>
    </Layout>
  );
}
