import type { PageProps } from 'rs-hono';
import { Layout } from './layout';

/**
 * Profile page — dynamic (SSR).
 * Props include PageProps PLUS whatever the loader returns.
 *
 * The loader (in routes.ts) returns { user, posts }.
 * We accept any extra props and narrow at usage time.
 */
export default function Profile(props: Record<string, unknown>) {
    const { user, posts, params } = props as unknown as PageProps & {
        user: { id: string; name: string; email: string; avatar: string };
        posts: Array<{ id: string; title: string; excerpt: string }>;
    };

    return (
        <Layout>
            <div className="profile-page">
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
