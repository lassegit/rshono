import { headers } from 'next/headers';
import { users, summary } from '@/data';

/** APP_SPEC.md `/ssr`: dynamic, 100 rows, zero client components. */
export const dynamic = 'force-dynamic';

export default async function Ssr() {
  const agent = (await headers()).get('user-agent') ?? 'unknown';

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
      <p className="summary">Rendered per request for {agent.slice(0, 40)}</p>
    </>
  );
}
