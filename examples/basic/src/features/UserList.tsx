import { Layout } from './layout';

export default function UserList(props: Record<string, unknown>) {
    const { users } = props as unknown as {
        users: Array<{ id: string; name: string; email: string; avatar: string }>;
    };

    return (
        <Layout>
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
            </div>
        </Layout>
    );
}
