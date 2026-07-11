import { useEffect } from 'react';
import type { LoaderProps } from 'rs-hono';
import type { loader } from './UserList.server';
import { Layout } from './layout';

export default function UserList({ users }: LoaderProps<typeof loader>) {
    useEffect(() => {
        console.log(process.env);
    }, []);

    return (
        <Layout title="Users — rs-hono">
            <div className="users-page">
                <h1>All Users</h1>
                <p className="subtitle">
                    {users.length} user{users.length !== 1 ? 's' : ''} found.
                </p>

                <div className="user-grid">
                    {users.map((user) => (
                        <a href={`/profile/${user.id}`} key={user.id} className="user-card">
                            <div className="avatar">{user.avatar}</div>
                            <div className="user-info">
                                <strong>{user.name}</strong>
                                <span className="email">{user.email}</span>
                            </div>
                            <span className="arrow">→</span>
                        </a>
                    ))}
                </div>

                <p className="meta">
                    This page is <code>kind: "dynamic"</code>. Data comes from the loader.
                </p>
                <p className="meta">
                    Public env test — <code>PUBLIC_API_ENDPOINT</code>: <code>{process.env.PUBLIC_API_ENDPOINT}</code>
                </p>
                <p>This is a private key: "{process.env.DATABASE_URL}"</p>
            </div>
        </Layout>
    );
}
