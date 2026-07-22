import type { PageProps } from 'rshono';
import { notFound } from 'rshono/server';
import { fakeDB } from '../db';
import { Layout } from './layout';

export default async function Profile({ params }: PageProps<'/profile/:id'>) {
  const user = await fakeDB.getUser(params.id);

  if (!user) notFound();

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
