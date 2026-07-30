import type { PageProps } from '@rshono/core';
import { Layout } from './layout';

/** Declared as `notFound` in routes.ts. Answers unmatched paths, and any `notFound()` call, with a 404. */
export default function NotFound({ url }: PageProps) {
  return (
    <Layout title="Not found">
      <div className="py-10">
        <p className="mb-2 text-sm font-medium text-sky-700 dark:text-sky-400">404</p>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">Page not found</h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Nothing at <code>{url.pathname}</code>.
        </p>
        <p className="flex gap-4">
          <a href="/">Back home</a>
          <a href="/docs/getting-started">Read the docs</a>
        </p>
      </div>
    </Layout>
  );
}
