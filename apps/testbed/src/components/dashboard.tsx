import type { PageProps } from '@rshono/core';
import { redirect } from '@rshono/core/server';
// Type-only, so importing the server sub-app from a page module costs nothing at runtime.
import type { AppEnv } from '../server';
import { Layout } from './layout';
import { LogoutButton } from './logout-button';

export default function Dashboard({ ctx }: PageProps<'/dashboard', AppEnv>) {
  const session = ctx.cookies.get('session');
  if (!session) redirect('/login');

  return (
    <Layout title="Dashboard — rshono">
      <div className="page">
        <h1>Dashboard</h1>
        <p className="description">
          Signed in as <code>{decodeURIComponent(session)}</code>. This page <code>redirect()</code>s to <code>/login</code> when the session cookie
          is missing.
        </p>
        <p className="meta">
          Served for request <code data-ctx="request-id">{ctx.var.requestId}</code> — a variable set by middleware in <code>src/server.ts</code> and
          typed by handing this app's Hono <code>Env</code> to <code>PageProps</code>.
        </p>
        <LogoutButton />
      </div>
    </Layout>
  );
}
