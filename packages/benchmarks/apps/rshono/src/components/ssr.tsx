import type { PageProps } from '@rshono/core';
import { summary, users } from '../data';
import { Layout } from './layout';

/**
 * APP_SPEC.md `/ssr`: dynamic, 100 rows, zero client components.
 *
 * Reads `ctx` so the route cannot be hoisted to build time by anything clever — the equivalent of
 * `export const dynamic = 'force-dynamic'` in the Next app.
 */
export default function Ssr({ ctx }: PageProps) {
  const agent = ctx.req.header('user-agent') ?? 'unknown';

  return (
    <Layout title="Users">
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
    </Layout>
  );
}
