import type { ErrorPageProps } from '@rshono/core';
import { Layout } from './layout';

/**
 * Declared as `error` in routes.ts. Answers a request that threw, with a 500.
 *
 * `error.message` is the real message in development and a generic `'Internal Server Error'` in
 * production, where `error.stack` is absent — so this component can show it without leaking anything.
 */
export default function ServerError({ error }: ErrorPageProps) {
  return (
    <Layout title="Something went wrong">
      <div className="py-10">
        <p className="mb-2 text-sm font-medium text-red-600 dark:text-red-400">500</p>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">Something went wrong</h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">{error.message}</p>
        {error.stack && (
          <pre className="mb-6 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            {error.stack}
          </pre>
        )}
        <p className="flex gap-4">
          <a href="/">Back home</a>
          <a href="https://github.com/rshono/rshono/issues" data-native>
            Report an issue
          </a>
        </p>
      </div>
    </Layout>
  );
}
