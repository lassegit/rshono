import { Layout } from './layout';

/**
 * APP_SPEC.md `/`: prerendered, zero client components. The floor measurement — how much JavaScript
 * does the framework ship for a page whose content needs none?
 *
 * Reads no `ctx`: a `render: 'static'` page has no request to read one from.
 */
export default function Home() {
  return (
    <Layout title="Benchmark Suite">
      <h1>Benchmark Suite</h1>
      <p className="subtitle">One app, three frameworks, identical output.</p>
      <div className="cards">
        <div className="card">
          <h2>Server Components</h2>
          <p>Pages run on the server and read data with plain async/await. Nothing static ships JavaScript.</p>
        </div>
        <div className="card">
          <h2>Server Actions</h2>
          <p>Server functions callable from the browser, with the result rendered where it was requested.</p>
        </div>
        <div className="card">
          <h2>HTTP Endpoints</h2>
          <p>A JSON route with no React on the path, for measuring the HTTP layer on its own.</p>
        </div>
      </div>
    </Layout>
  );
}
