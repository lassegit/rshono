import { fakeDB } from '../db.server';
import { AddUserForm } from './add-user-form';
import { Layout } from './layout';

/**
 * An async server component: it reads the database directly — no
 * loader, no API round-trip — and the result streams to the browser as
 * part of the payload. After the AddUserForm's server action runs, the
 * returned payload re-renders this list with the new user in it.
 */
export default async function UserList() {
  const users = await fakeDB.listUsers();

  return (
    <Layout title="Users — rshono">
      <div className="page">
        <h1>Users</h1>
        <p className="description">
          Fetched inside an <code>async</code> server component, straight from a <code>*.server</code> module.
        </p>

        <ul className="user-list">
          {users.map((user) => (
            <li key={user.id} className="feature-card">
              <span className="emoji">{user.avatar}</span>{' '}
              <a href={`/profile/${user.id}`}>
                <strong>{user.name}</strong>
              </a>{' '}
              <span className="meta">{user.email}</span>
            </li>
          ))}
        </ul>

        <AddUserForm />
      </div>
    </Layout>
  );
}
