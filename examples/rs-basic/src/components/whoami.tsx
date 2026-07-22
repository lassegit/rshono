import { getContext } from 'rshono/server';
import { Layout } from './layout';

export default async function WhoAmI() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const ctx = getContext();
  const testHeader = ctx.req.header('x-test') ?? '(no x-test header)';
  const visitor = ctx.cookies.get('visitor') ?? '(no visitor cookie)';
  const apiEndpoint = ctx.env.PUBLIC_API_ENDPOINT ?? '(unset)';

  return (
    <Layout title="whoami — rshono">
      <div className="page">
        <h1>whoami</h1>
        <p className="description">The rshono request context — one object, read inside an async server component.</p>
        <ul className="user-list">
          <li className="feature-card">
            pathname: <code>{ctx.pathname}</code>
          </li>
          <li className="feature-card">
            x-test header: <code>{testHeader}</code>
          </li>
          <li className="feature-card">
            visitor cookie: <code>{visitor}</code>
          </li>
          <li className="feature-card">
            env PUBLIC_API_ENDPOINT: <code>{apiEndpoint}</code>
          </li>
        </ul>
      </div>
    </Layout>
  );
}
