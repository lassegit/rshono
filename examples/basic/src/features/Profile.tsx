import type { LoaderProps } from 'rs-hono';
import type { loader } from './Profile.server';
import { Layout } from './layout';

/**
 * Profile page — dynamic (SSR).
 *
 * Props are INFERRED from the loader in Profile.server.ts — no manual
 * prop types, no casts. The import above is type-only, so it is erased
 * at compile time and the client bundle never references the server
 * module. `params.id` is typed from the '/profile/:id' pattern.
 */
export default function Profile({ user, posts, params }: LoaderProps<typeof loader>) {
    return (
        <Layout title={`${user.name} — rs-hono`} description={`Profile and recent posts of ${user.name}.`}>
            <div className="profile-page">
                {/* Rendered mid-tree, but React 19 hoists it into <head>. */}
                <meta property="og:title" content={user.name} />
                <div className="profile-header">
                    <div className="avatar">{user.avatar}</div>
                    <div>
                        <h1>{user.name}</h1>
                        <p className="email">{user.email}</p>
                        <p className="meta">
                            User ID: <code>{params.id}</code>
                        </p>
                    </div>
                </div>

                <h2>Recent Posts</h2>
                <div className="post-list">
                    {posts.map((post) => (
                        <article key={post.id} className="post-card">
                            <h3>{post.title}</h3>
                            <p>{post.excerpt}</p>
                        </article>
                    ))}
                </div>

                <p className="meta">
                    This page is <code>kind: "dynamic"</code> — server-rendered on each request.
                    <br />
                    The loader fetches user data before the page renders.
                </p>
            </div>
        </Layout>
    );
}
