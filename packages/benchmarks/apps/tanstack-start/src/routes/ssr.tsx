import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { renderServerComponent } from '@tanstack/react-start/rsc';

/**
 * APP_SPEC.md `/ssr`: dynamic, 100 rows. Excluded from prerendering in vite.config.ts.
 *
 * The table is a server component rather than route markup, so this route pays the same flight
 * encode/decode round trip per request that rshono and Next pay. `renderServerComponent` rather
 * than `createCompositeComponent` because the page has no client components to slot in.
 */
const getUsersTable = createServerFn().handler(async () => {
  const [{ users, summary }, { UsersTable }] = await Promise.all([import('../data'), import('../components/users-table')]);
  return { Table: await renderServerComponent(<UsersTable users={users} summary={summary} />) };
});

export const Route = createFileRoute('/ssr')({
  loader: () => getUsersTable(),
  component: Ssr,
});

function Ssr() {
  const { Table } = Route.useLoaderData();
  return <>{Table}</>;
}
