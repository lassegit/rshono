import type { PageProps } from '@rshono/core';
import { publicEnv } from '../lib/env';
import type { AppEnv } from '../server';
import { GreetForm } from './greet-form';
import { Layout } from './layout';

/**
 * A page is a React **server component**: it runs on the server only, may be `async`, and can await data
 * directly — no loaders, no client bundle for any of this.
 *
 * The `AppEnv` type argument is what types `ctx.var` key by key; without it `ctx.var` is an open record.
 */
export default function Home({ url, ctx }: PageProps<'/', AppEnv>) {
  return (
    <Layout description="A new rshono app.">
      <h1>{publicEnv.appName}</h1>
      <p>
        Edit <code>src/components/home.tsx</code> and save. The page re-renders in place — the form below keeps whatever you have typed in it.
      </p>

      <h2>Server actions</h2>
      <p>
        This form calls a <code>'use server'</code> function in <code>src/actions.ts</code>. It works before hydration and with JavaScript disabled.
      </p>
      <GreetForm />

      <h2>Where things are</h2>
      <ul>
        <li>
          <code>src/routes.ts</code> — the route table, the one file rshono requires
        </li>
        <li>
          <code>src/server.ts</code> — a Hono app for middleware and API routes, mounted ahead of the pages
        </li>
        <li>
          <code>src/components/</code> — pages and components; <code>src/lib/</code> — everything else
        </li>
        <li>
          <code>rshono.config.ts</code> — deploy target, security and build settings
        </li>
      </ul>

      <p>
        {/* `ctx` is the request context — cookies, headers, env, middleware variables — handed to the page as a
            prop, so reading it needs no import. It is server-only and never crosses into a client component. */}
        Rendered on the server for <code>{url.pathname}</code>, request <code>{ctx.var.requestId}</code>.
      </p>
    </Layout>
  );
}
