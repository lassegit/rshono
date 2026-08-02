import type { User } from '../server-fns';

/**
 * The body of `/ssr`, as a server component.
 *
 * Its own module, reached only through a dynamic import inside the route's server function, so it
 * never enters the client graph — the same reason `server-fns.ts` imports the fixture that way.
 * Rendered through `renderServerComponent`, which is what puts React's flight encode (here) and
 * decode (in the SSR pass) on the request path, matching what rshono and Next do for every page.
 */
export function UsersTable({ users, summary }: { users: User[]; summary: { count: number; totalScore: number; admins: number } }) {
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
