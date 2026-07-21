import type { ErrorPageProps } from 'rshono';
import { Layout } from './layout';

export default function ErrorPage({ error }: ErrorPageProps) {
  return (
    <Layout title="Something went wrong — rshono">
      <div className="page">
        <h1>Something went wrong</h1>
        <p className="description">{error.message}</p>
        {error.stack && (
          <pre className="feature-card" style={{ overflowX: 'auto', textAlign: 'left', fontSize: '0.8rem' }}>
            {error.stack}
          </pre>
        )}
        <p>
          <a href="/">Back to the start</a>
        </p>
      </div>
    </Layout>
  );
}
