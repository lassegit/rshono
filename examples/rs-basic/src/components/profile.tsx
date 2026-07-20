import type { PageProps } from 'rshono';
import { fakeDB } from '../db.server';
import { Layout } from './layout';

/**
 * Route params, typed from the route pattern: PageProps<'/profile/:id'>
 * gives `params.id: string`.
 */
export default async function Profile({ params }: PageProps<'/profile/:id'>) {
  const user = await fakeDB.getUser(params.id);

  if (!user) {
    return (
      <Layout title="User not found — rshono">
        <div className="page">
          <h1>User not found</h1>
          <p className="description">
            No user with id <code>{params.id}</code>. <a href="/users">Back to the list</a>.
          </p>
        </div>
      </Layout>
    );
  }

  const posts = await fakeDB.getUserPosts(user.id);

  return (
    <Layout title={`${user.name} — rshono`}>
      <div className="page">
        <h1>
          <span className="emoji">{user.avatar}</span> {user.name}
        </h1>
        <p className="description">{user.email}</p>

        <h3>Posts</h3>
        <ul className="user-list">
          {posts.map((post) => (
            <li key={post.id} className="feature-card">
              <strong>{post.title}</strong>
              <p className="meta">{post.excerpt}</p>
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  );
}
