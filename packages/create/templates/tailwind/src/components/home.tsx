import type { PageProps } from '@rshono/core';
import { appName, Layout } from './layout';

export default function Home({ url }: PageProps<'/'>) {
  return (
    <Layout description="A new rshono app.">
      <h1 className="mb-2 text-4xl font-semibold tracking-tight">{appName}</h1>
      <p className="mb-4">
        Edit <code>src/components/home.tsx</code> and save — the page re-renders in place.
      </p>

      <h2 className="mt-10 mb-2 text-lg font-semibold">Where things are</h2>
      <ul className="mb-4 list-disc space-y-1 pl-5">
        <li>
          <code>src/routes.ts</code> — the route table, the one file rshono requires
        </li>
        <li>
          <code>src/server.ts</code> — a Hono app for middleware and API routes, mounted ahead of the pages
        </li>
        <li>
          <code>src/components/</code> — pages and components
        </li>
        <li>
          <code>rshono.config.ts</code> — deploy target, security and build settings
        </li>
      </ul>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Rendered on the server for <code>{url.pathname}</code>.
      </p>
    </Layout>
  );
}
