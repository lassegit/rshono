import type { PageProps } from 'rshono';
import { getContext, redirect } from 'rshono/server';
import { Layout } from './layout';

export default function Dashboard(_props: PageProps) {
  const session = getContext().cookies.get('session');
  if (!session) redirect('/login');

  return (
    <Layout title="Dashboard — rshono">
      <div className="page">
        <h1>Dashboard</h1>
        <p className="description">
          Signed in as <code>{decodeURIComponent(session)}</code>. This page <code>redirect()</code>s to <code>/login</code> when the session cookie
          is missing.
        </p>
      </div>
    </Layout>
  );
}
