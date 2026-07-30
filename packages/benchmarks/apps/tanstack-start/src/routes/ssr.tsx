import { createFileRoute } from '@tanstack/react-router';
import { getUsers } from '../server-fns';

/** APP_SPEC.md `/ssr`: dynamic, 100 rows. Excluded from prerendering in vite.config.ts. */
export const Route = createFileRoute('/ssr')({
  loader: () => getUsers(),
  component: Ssr,
});

function Ssr() {
  const { users, summary } = Route.useLoaderData();

  return (
    <>
      <h1>Users</h1>
      <p className="summary">
        {summary.count} users · {summary.totalScore.toLocaleString('en-US')} total score · {summary.admins} admins
      </p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th className="num">Score</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td className="num">{user.id}</td>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td className="num">{user.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="summary">Rendered per request.</p>
    </>
  );
}
