import type { PageProps } from '@rshono/core';
import { highlightCode } from '../content/markdown';
import { CommandTabs, SCAFFOLD_COMMAND } from './command-tabs';
import { Layout } from './layout';
import { Logo } from './logo';

const ROUTES_SAMPLE = `
import { defineRoutes } from '@rshono/core';

export const routes = defineRoutes({
  routes: [
    { path: '/', component: () => import('./components/home') },
    { path: '/profile/:id', component: () => import('./components/profile') },
    {
      path: '/docs/:slug',
      render: 'static',
      component: () => import('./components/documentation'),
      staticPaths: async () => [{ slug: 'getting-started' }, { slug: 'deployment' }],
    },
    { type: 'endpoint', path: '/api/health', server: () => import('./health') },
  ],
  notFound: { component: () => import('./components/404') },
  error: { component: () => import('./components/500') },
});
`;

const PAGE_SAMPLE = `
import type { PageProps } from '@rshono/core';
import { db } from '../db';

export default async function Profile({ params, ctx }: PageProps<'/profile/:id'>) {
  const user = await db.getUser(params.id);
  const theme = ctx.cookies.get('theme') ?? 'light';
  return <Layout theme={theme}>{user.name}</Layout>;
}
`;

/**
 * The case for the framework, as opposed to the list of what it does.
 *
 * Every number in here is measured rather than claimed, and the [comparison page](/comparison) shows the
 * working — which is why these read as flatly as they do. `eleven exports` and `seventeen packages` are
 * checkable in a minute, and that is the whole argument: nothing on this page needs to be taken on
 * trust.
 */
const REASONS = [
  {
    title: 'An API you can finish reading',
    body: 'Eleven exported values across three import paths. defineRoutes, getContext, useNavigation and eight more — that is the framework. No second router to learn later, no unstable_ tier, nothing that behaves differently depending on which directory you called it from.',
  },
  {
    title: 'Your architecture, not the router’s',
    body: 'No file-system routing, so your directory tree is not a function of your URLs. Arrange src/ by domain, by feature, by team — routes are one explicit array, and moving a page is an edit to one line rather than a migration.',
  },
  {
    title: 'HTML elements, not re-inventions',
    body: 'No <Link>, no <Image>, no <Script>, no <Head>, no font loader. Links are <a href>, images are <img> pointing at a hashed URL, forms are <form action>. Every attribute you already know still works, and HTML from a CMS or rendered markdown behaves like the rest.',
  },
  {
    title: 'The request is a prop',
    body: 'A page is handed { url, params, ctx } and awaits your database directly. No async accessor to import, no rule about which call makes a route dynamic, no cache to reason about. Client components import ‘use server’ functions and call them — no route handler in between.',
  },
  {
    title: 'A dependency tree you could audit',
    body: 'Seventeen packages install, seven of them direct. That is Hono, Rspack, React’s RSC bindings and little else — every one nameable, versionable and auditable, because none of it is vendored out of sight.',
  },
  {
    title: 'One bundler, dev and build',
    body: 'Both commands build the same pair of Rspack configs from the same function, and dev runs the real production server bundle in a worker thread. Rspack and the RSC bindings are pinned exactly, so an install cannot hand you a bundler this release never saw.',
  },
  {
    title: 'The parts are named, not renamed',
    body: 'The server is a Hono app and you get the whole thing. The build is an Rspack config and the config hook hands it to you. Rendering is React Server Components, unrenamed. Their documentation is your documentation, and what you learn here transfers out.',
  },
  {
    title: 'No platform, and no legacy',
    body: 'Seven deploy targets behind one interface the build resolves — one flag, not an adapter package each. And one router with one rendering model: there is no earlier generation of rshono still in the API for compatibility’s sake.',
  },
];

/** The four numbers behind the copy above, for a reader who scans before they read. */
const NUMBERS = [
  { value: '11', label: 'exported functions and components' },
  { value: '3', label: 'public import paths' },
  { value: '17', label: 'packages in a production install' },
  { value: '1', label: 'required file' },
];

const FEATURES = [
  {
    title: 'Two files, no conventions',
    body: 'src/routes.ts is required and src/server.ts is optional. No pages/ directory, no *.server.ts, no filename magic — everything else is yours to arrange.',
    href: '/docs/project-layout',
  },
  {
    title: 'Server components by default',
    body: 'Pages run on the server and await data directly. Interactive parts are ‘use client’ components they import, and only those ship JavaScript.',
    href: '/docs/pages',
  },
  {
    title: 'Actions that work without JS',
    body: 'A ‘use server’ function wired to a form posts before hydration and with JavaScript disabled. Every response carries a fresh page payload.',
    href: '/docs/server-actions',
  },
  {
    title: 'Prerender what does not change',
    body: 'A static route is built once — as a document for a hard load and a flight payload for a soft navigation, so in-app clicks are prerendered too.',
    href: '/docs/prerendering',
  },
  {
    title: 'Secrets that cannot ship',
    body: 'In client code process.env is replaced at build time with NODE_ENV and PUBLIC_ variables only. A stray DATABASE_URL compiles to undefined — inside node_modules too.',
    href: '/docs/environment',
  },
  {
    title: 'Full Hono underneath',
    body: 'Middleware, endpoints, streaming, cookies, end-to-end client types. The sub-app mounts ahead of the page routes, so its middleware wraps them too.',
    href: '/docs/hono',
  },
];

const TARGETS = ['node', 'bun', 'deno', 'cloudflare', 'vercel', 'netlify', 'aws-lambda'];

/**
 * The landing page.
 *
 * `render: 'static'` like the docs, and for the same reason: the samples are highlighted by Shiki at
 * build time, so what a browser gets is finished HTML with no highlighter anywhere near it.
 */
export default async function Home({ url }: PageProps<'/'>) {
  const [routesHtml, pageHtml] = await Promise.all([highlightCode(ROUTES_SAMPLE, 'ts'), highlightCode(PAGE_SAMPLE, 'tsx')]);

  return (
    <Layout description="Minimalist web framework — Hono + Rspack + React Server Components." canonical={url.href} wide>
      <Hero />
      <Numbers />
      <Samples routesHtml={routesHtml} pageHtml={pageHtml} />
      <Reasons />
      <Features />
      <Deployment />
      <ClosingCta />
    </Layout>
  );
}

function Hero() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 pt-20 pb-16 text-center">
      <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <span className="inline-block size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
        Alpha — built on Rspack&rsquo;s RSC support
      </p>

      <h1 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight text-balance text-zinc-900 sm:text-6xl dark:text-white">
        A minimalist framework for React Server Components
      </h1>

      <h2 className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-zinc-600 dark:text-zinc-400">
        <a href="https://hono.dev" data-native>
          Hono
        </a>{' '}
        for the server,{' '}
        <a href="https://rspack.rs" data-native>
          Rspack
        </a>{' '}
        for the build,{' '}
        <a href="https://react.dev/reference/rsc/server-components" data-native>
          React Server Components
        </a>{' '}
        for the rendering. One required file, and no conventions to learn around it.
      </h2>

      <p className="mx-auto mt-4 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-400"></p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <a
          href="/docs/getting-started"
          data-prefetch
          className="rounded-lg bg-zinc-900 px-5 py-2.5 font-medium text-white no-underline hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Get started
        </a>
        <a
          href="/comparison"
          data-prefetch
          className="rounded-lg border border-zinc-300 px-5 py-2.5 font-medium text-zinc-900 no-underline hover:bg-zinc-50 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-900"
        >
          Why not Next.js?
        </a>
      </div>

      <div className="mt-8">
        <CommandTabs id="pm-hero" command={SCAFFOLD_COMMAND} />
      </div>

      <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-zinc-500 dark:text-zinc-400">
        <li>Streaming SSR + RSC hydration</li>
        <li aria-hidden="true">·</li>
        <li>HMR that keeps browser state</li>
        <li aria-hidden="true">·</li>
        <li>Soft navigation &amp; prefetch</li>
        <li aria-hidden="true">·</li>
        <li>Build-time prerendering</li>
      </ul>
    </section>
  );
}

/** The scannable version of {@link Reasons}, sitting directly under the hero. */
function Numbers() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 pb-4">
      <ul className="grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800">
        {NUMBERS.map((item) => (
          <li key={item.label} className="bg-white p-6 text-center dark:bg-zinc-950">
            <p className="text-3xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-white">{item.value}</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Reasons() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="mb-10 max-w-3xl">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Why this one</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Not because the others are bad — three of them are more mature than this one. Because a framework should be small enough to hold in your
          head, honest about what it is built on, and quiet about how you arrange your own code.
        </p>
      </div>

      <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {REASONS.map((reason) => (
          <li key={reason.title}>
            <h3 className="mb-2 font-medium text-zinc-900 dark:text-white">{reason.title}</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{reason.body}</p>
          </li>
        ))}
      </ul>

      <p className="mt-10">
        <a href="/comparison" data-prefetch>
          See it next to Next.js, TanStack Start, Waku and Astro — including where they win →
        </a>
      </p>
    </section>
  );
}

function Samples({ routesHtml, pageHtml }: { routesHtml: string; pageHtml: string }) {
  return (
    <section className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-16 lg:grid-cols-2">
      <figure className="min-w-0">
        <figcaption className="mb-3">
          <h2 className="font-medium text-zinc-900 dark:text-white">The one required file</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            An explicit table, not a directory scan. Each page&rsquo;s props are checked against the path it is mounted at.
          </p>
        </figcaption>
        {/* Highlighted at build time from a constant in this file — not user input. */}
        <div className="prose" dangerouslySetInnerHTML={{ __html: routesHtml }} />
      </figure>

      <figure className="min-w-0">
        <figcaption className="mb-3">
          <h2 className="font-medium text-zinc-900 dark:text-white">A page is a server component</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Async, awaiting data directly. <code>PageProps</code> types <code>params</code> from the path literal.
          </p>
        </figcaption>
        <div className="prose" dangerouslySetInnerHTML={{ __html: pageHtml }} />
      </figure>
    </section>
  );
}

function Features() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-16">
      <h2 className="mb-10 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">What you get</h2>
      <ul className="grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800">
        {FEATURES.map((feature) => (
          <li key={feature.title} className="bg-white p-6 dark:bg-zinc-950">
            <h3 className="mb-2 font-medium text-zinc-900 dark:text-white">{feature.title}</h3>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{feature.body}</p>
            <a href={feature.href} data-prefetch className="text-sm">
              Read more →
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Deployment() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-16">
      <div className="rounded-xl border border-zinc-200 p-8 dark:border-zinc-800">
        <h2 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Seven targets, one build command</h2>
        <p className="mb-6 max-w-2xl text-zinc-600 dark:text-zinc-400">
          Everything that depends on <em>where</em> the app runs — binding a port, serving assets, reading a prerendered page, gzipping — sits behind
          one interface the build resolves per target. Every one of them streams.
        </p>
        <ul className="flex flex-wrap gap-2">
          {TARGETS.map((target) => (
            <li
              key={target}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {target}
            </li>
          ))}
        </ul>
        <p className="mt-6">
          <a href="/docs/deployment" data-prefetch>
            Compare the targets →
          </a>
        </p>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 pt-8 pb-24 text-center">
      <p className="mb-4 flex justify-center">
        <Logo size={32} />
      </p>
      <h2 className="mb-3 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Start with a scaffold</h2>
      <p className="mx-auto mb-8 max-w-xl text-zinc-600 dark:text-zinc-400">
        Pick a deploy target, a styling choice and a formatter, and get a working app. Every question is also a flag.
      </p>
      <CommandTabs id="pm-cta" command={SCAFFOLD_COMMAND} />
    </section>
  );
}
