import type { ErrorPageProps } from 'rshono';
import { Layout } from './layout';

/**
 * Declared as `error` in routes.ts. Answers a request that threw, with a 500.
 *
 * `error.message` is the real message in development and a generic `'Internal Server Error'` in
 * production, where `error.stack` is absent — so this component can show it without leaking anything.
 */
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
