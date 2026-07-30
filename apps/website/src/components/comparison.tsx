import type { PageProps } from '@rshono/core';
import { highlightCode } from '../content/markdown';
import { Layout } from './layout';

/**
 * `/comparison` — how rshono differs from the frameworks people arrive here already using.
 *
 * Every number on this page is measured rather than asserted, and the method is written down at the
 * bottom so a reader can re-run it. That constraint is why the page holds no benchmarks: request
 * throughput depends far more on what a page does than on whose framework wrapped it, and a chart of
 * our own making would prove nothing a reader should believe.
 *
 * The honest counterpart is {@link Tradeoffs} — the section that says where the others are ahead. It is
 * on the page for the same reason the [limitations](/docs/limitations) doc exists: a comparison with no
 * losing rows is an advertisement, and it reads like one.
 */
export default async function Comparison({ url }: PageProps<'/comparison'>) {
  const [linksHtml, contextHtml] = await Promise.all([highlightCode(LINKS_SAMPLE, 'tsx'), highlightCode(CONTEXT_SAMPLE, 'tsx')]);

  return (
    <Layout
      title="rshono vs Next.js, TanStack Start, Waku and Astro"
      description="A measured comparison: API surface, dependency count, routing model, bundler and platform support — with the method written down and the trade-offs stated."
      canonical={url.href}
      wide
    >
      <Intro />
      <Matrix />
      <Install />
      <Arguments linksHtml={linksHtml} contextHtml={contextHtml} />
      <Tradeoffs />
      <Method />
    </Layout>
  );
}

function Intro() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pt-16 pb-8">
      <h1 className="mb-4 text-4xl font-semibold tracking-tight text-balance text-zinc-900 dark:text-white">rshono compared</h1>
      <p className="mb-6 text-lg text-pretty text-zinc-600 dark:text-zinc-400">
        Next.js, TanStack Start, Waku and Astro are all good at what they set out to do, and three of them are more mature than this one. What follows
        is where rshono is actually different — with the numbers measured and the <a href="#tradeoffs">places it loses</a> on the same page.
      </p>
      <p className="text-zinc-600 dark:text-zinc-400">
        The short version: rshono has eleven exported functions, seventeen installed packages and no opinion about your directory tree. Everything
        below is that sentence, in detail.
      </p>
    </section>
  );
}

/** The columns, in the order every row below lists them. */
const FRAMEWORKS = ['rshono', 'Next.js', 'TanStack Start', 'Waku', 'Astro'] as const;

/**
 * The matrix.
 *
 * Cells are deliberately descriptive rather than ✓/✗: nearly every row here is a design choice, not a
 * missing feature, and a tick column would turn a difference of opinion into a scoreboard. Where a
 * competing choice is the better one — Astro's plain anchors, Next's adapter-free Vercel path — the
 * cell says so.
 */
const MATRIX: Array<{ dimension: string; note?: string; cells: Record<(typeof FRAMEWORKS)[number], string> }> = [
  {
    dimension: 'Route declaration',
    cells: {
      rshono: 'One explicit table in src/routes.ts',
      'Next.js': 'File system — app/ directory',
      'TanStack Start': 'File system — src/routes/; code-based supported',
      Waku: 'File system — src/pages/',
      Astro: 'File system — src/pages/',
    },
  },
  {
    dimension: 'HTML elements replaced by a component',
    note: 'Counted from the components each package ships.',
    cells: {
      rshono: 'None — <a>, <img>, <form>, <script> stay themselves',
      'Next.js': '<Link>, <Image>, <Script>, <Form> — plus next/font and next/dynamic',
      'TanStack Start': '<Link>, <Scripts>, <HeadContent>, <Outlet>',
      Waku: '<Link>, <Router>, <Slice>',
      Astro: '<Image>, <Picture>, <Font>, <ClientRouter> — anchors stay native',
    },
  },
  {
    dimension: 'Client navigation hooks',
    note: 'Counted from the shipped type declarations.',
    cells: {
      rshono: '1 — useNavigation()',
      'Next.js': '5 in next/navigation — useRouter, usePathname, useSearchParams, useParams, useSelectedLayoutSegment(s)',
      'TanStack Start': 'Several — useRouter, useParams, useSearch, useNavigate, useLocation, …',
      Waku: '5 — useRouter, useParams, useSearch, useSetSearch, useNavigationStatus',
      Astro: 'None — islands manage their own state',
    },
  },
  {
    dimension: 'Reading the request on the server',
    cells: {
      rshono: 'ctx prop on the page, or getContext()',
      'Next.js': 'await cookies(), await headers(), await connection()',
      'TanStack Start': 'getRequest() inside a server function',
      Waku: 'unstable_getHeaders() from waku/router/server',
      Astro: 'Astro.request / Astro.cookies',
    },
  },
  {
    dimension: 'Public entry points',
    note: 'Import paths the package publishes.',
    cells: {
      rshono: '3',
      'Next.js': '23',
      'TanStack Start': '18',
      Waku: '14',
      Astro: '58',
    },
  },
  {
    dimension: 'Bundler',
    cells: {
      rshono: 'Rspack — same config in dev and build, pinned exactly',
      'Next.js': 'Turbopack (default since 16; webpack deprecated)',
      'TanStack Start': 'Vite',
      Waku: 'Vite',
      Astro: 'Vite',
    },
  },
  {
    dimension: 'Rendering model',
    cells: {
      rshono: 'React Server Components, every page',
      'Next.js': 'React Server Components (App Router)',
      'TanStack Start': 'SSR + client router; RSC available',
      Waku: 'React Server Components',
      Astro: 'Server-rendered HTML + client islands',
    },
  },
  {
    dimension: 'Server functions',
    cells: {
      rshono: "'use server' — callable directly, forms work without JS",
      'Next.js': "'use server'",
      'TanStack Start': 'createServerFn()',
      Waku: "'use server'",
      Astro: 'Astro Actions',
    },
  },
  {
    dimension: 'Deploy targets',
    cells: {
      rshono: '7 built in — one build command, no adapter package',
      'Next.js': 'Vercel first-class; others via community adapters',
      'TanStack Start': 'Target presets via the build config',
      Waku: 'Adapters, per platform',
      Astro: 'Adapters, per platform',
    },
  },
];

function Matrix() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-12">
      <h2 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Side by side</h2>

      {/* The table is wider than a phone. It scrolls in its own box rather than the page. */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-4xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-900 dark:text-white">
                &nbsp;
              </th>
              {FRAMEWORKS.map((framework) => (
                <th
                  key={framework}
                  scope="col"
                  className={`px-4 py-3 text-left font-medium ${
                    framework === 'rshono' ? 'text-sky-700 dark:text-sky-400' : 'text-zinc-900 dark:text-white'
                  }`}
                >
                  {framework}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((row) => (
              <tr key={row.dimension} className="border-b border-zinc-200 last:border-0 dark:border-zinc-800">
                <th scope="row" className="px-4 py-3 text-left align-top font-medium text-zinc-900 dark:text-white">
                  {row.dimension}
                  {row.note && <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">{row.note}</span>}
                </th>
                {FRAMEWORKS.map((framework) => (
                  <td
                    key={framework}
                    className={`px-4 py-3 align-top ${
                      framework === 'rshono' ? 'bg-sky-50/60 text-zinc-800 dark:bg-sky-950/20 dark:text-zinc-200' : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {row.cells[framework]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * What each framework actually installs.
 *
 * `packages` is npm's own count for a production install; `on disk` is the resulting `node_modules`.
 * Both are worth showing, because they disagree in an instructive way — see the note under the table.
 */
const INSTALLS: Array<{ name: string; version: string; packages: number; disk: string; installed: string }> = [
  { name: 'rshono', version: '1.0.0-rc.3', packages: 17, disk: '67 MB', installed: '@rshono/core hono react react-dom' },
  { name: 'Next.js', version: '16.2.12', packages: 22, disk: '330 MB', installed: 'next react react-dom' },
  { name: 'TanStack Start', version: '1.168.33', packages: 101, disk: '73 MB', installed: '@tanstack/react-start react react-dom' },
  { name: 'Waku', version: '1.0.0-beta.8', packages: 110, disk: '96 MB', installed: 'waku react react-dom' },
  { name: 'Astro + React', version: '7.1.6', packages: 255, disk: '185 MB', installed: 'astro @astrojs/react react react-dom' },
];

function Install() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-12">
      <h2 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">What lands in node_modules</h2>
      <p className="mb-6 max-w-3xl text-zinc-600 dark:text-zinc-400">
        Every dependency is code you ship, code you audit and code that can break you. So this is measured, not estimated — one empty directory per
        framework, one production install each, on the same machine on the same day.
      </p>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-900 dark:text-white">
                Installed
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-zinc-900 dark:text-white">
                Version
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-white">
                Packages
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-white">
                On disk
              </th>
            </tr>
          </thead>
          <tbody>
            {INSTALLS.map((row) => (
              <tr
                key={row.name}
                className={`border-b border-zinc-200 last:border-0 dark:border-zinc-800 ${
                  row.name === 'rshono' ? 'bg-sky-50/60 dark:bg-sky-950/20' : ''
                }`}
              >
                <th scope="row" className="px-4 py-3 text-left font-medium text-zinc-900 dark:text-white">
                  {row.name}
                  <span className="mt-1 block font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400">{row.installed}</span>
                </th>
                <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">{row.version}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{row.packages}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-800 dark:text-zinc-200">{row.disk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        Read those two columns together. Next.js installs only 22 packages but 330 MB, because it vendors its dependencies into its own published
        bundle — the code is still there, it is simply no longer a package you can name, version or audit separately. rshono&rsquo;s 17 packages{' '}
        <em>are</em> the whole tree, and{' '}
        <a href="https://github.com/rshono/rshono/blob/main/packages/core/package.json" data-native>
          seven of them are direct
        </a>
        : Hono&rsquo;s Node adapter, Rspack, its react-refresh plugin, react-refresh itself, React&rsquo;s RSC bindings for Rspack, an HTML-stream
        helper, and tsx for loading your config. Nothing else.
      </p>
    </section>
  );
}

const LINKS_SAMPLE = `
// rshono — the platform's own elements, met where they already are
import hero from './hero.png';                   // a content-hashed URL

<a href="/docs/pages">Pages</a>                  // soft navigation
<a href="/docs/pages" data-prefetch>Pages</a>    // warm it on hover
<a href="/docs/pages" data-native>Pages</a>      // force a full load

<img src={hero} alt="" loading="lazy" />         // attributes are just attributes
<form action={createUser}>…</form>               // posts before hydration too

// Elsewhere — a component each, with props of its own to learn
<Link href="/docs/pages" prefetch>Pages</Link>
<Image src={hero} alt="" width={1200} height={630} />
`;

const CONTEXT_SAMPLE = `
// rshono — the request is a prop, and server code is a function call
import { createUser } from '../actions/users';

export default async function Page({ ctx }: PageProps<'/admin'>) {
  const theme = ctx.cookies.get('theme') ?? 'light';
  return <form action={createUser}>…</form>;
}

// Next.js — the request is an import, and an async one
import { cookies } from 'next/headers';

export default async function Page() {
  const theme = (await cookies()).get('theme')?.value ?? 'light';
}
`;

/**
 * Element by element, with Next.js as the single contrast column — it is the one a reader is most
 * likely to be holding, and the full five-way spread is in {@link Matrix} already.
 */
const ELEMENTS: Array<{ want: string; rshono: string; next: string }> = [
  { want: 'A link', rshono: '<a href>', next: '<Link> from next/link' },
  { want: 'An image', rshono: '<img src={imported}>', next: '<Image> from next/image' },
  { want: 'A form that posts', rshono: '<form action={serverFn}>', next: '<form action>, or <Form> to keep the client router' },
  { want: 'A script tag', rshono: '<script>', next: '<Script> from next/script' },
  { want: 'Page metadata', rshono: 'Tags in the page’s own <head>', next: 'An exported metadata object, or <Head>' },
  { want: 'A web font', rshono: '@font-face on an imported .woff2', next: 'next/font/google, next/font/local' },
  { want: 'A lazily-loaded component', rshono: 'React’s lazy() and <Suspense>', next: 'next/dynamic' },
];

function ElementTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-2xl border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <th scope="col" className="px-4 py-2.5 text-left font-medium text-zinc-900 dark:text-white">
              You want
            </th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium text-sky-700 dark:text-sky-400">
              rshono
            </th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium text-zinc-900 dark:text-white">
              Next.js
            </th>
          </tr>
        </thead>
        <tbody>
          {ELEMENTS.map((row) => (
            <tr key={row.want} className="border-b border-zinc-200 last:border-0 dark:border-zinc-800">
              <th scope="row" className="px-4 py-2.5 text-left font-medium text-zinc-900 dark:text-white">
                {row.want}
              </th>
              <td className="bg-sky-50/60 px-4 py-2.5 font-mono text-xs text-zinc-800 dark:bg-sky-950/20 dark:text-zinc-200">{row.rshono}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">{row.next}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One heading per argument, in the order they matter to somebody deciding. */
function Arguments({ linksHtml, contextHtml }: { linksHtml: string; contextHtml: string }) {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-12">
      <h2 className="mb-10 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Where the difference is</h2>

      <div className="grid gap-12">
        <article>
          <h3 className="mb-3 text-lg font-medium text-zinc-900 dark:text-white">An API you can finish reading</h3>
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            rshono exports <strong>eleven values</strong> across three import paths. <code>defineRoutes</code>, <code>defineConfig</code> and{' '}
            <code>isPageRoute</code> from the root; <code>getContext</code>, <code>redirect</code>, <code>notFound</code> and{' '}
            <code>onServerError</code> from <code>/server</code>; <code>useNavigation</code>, <code>Boundary</code>, <code>ErrorBoundary</code> and{' '}
            <code>NavigationProgress</code> from <code>/client</code>. That is the whole framework. There is no second router to learn later, no{' '}
            <code>unstable_</code> tier, and nothing that behaves differently depending on which directory you called it from.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            For contrast, <code>next/navigation</code> alone exports five hooks and a family of control-flow throws, and it is one of twenty-three
            public entry points. Each of those is a thing that can surprise you, and a thing a new colleague has to be told about.
          </p>
        </article>

        <article>
          <h3 className="mb-3 text-lg font-medium text-zinc-900 dark:text-white">No file-system router, so no imposed architecture</h3>
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            A file-system router makes your directory tree a function of your URLs. That is fine until the two want different shapes — and they do, as
            soon as you organise by domain instead of by page. Then you are naming folders <code>(marketing)</code> and <code>(shop)</code> to un-say
            what the path said, teaching everyone which filenames are magic, and finding that a module&rsquo;s location is now load bearing.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            In rshono routes are one array in <code>src/routes.ts</code>, matched in order, and{' '}
            <em>
              everything else in <code>src/</code> is yours
            </em>
            . Arrange it by bounded context, by feature, by team, by whatever your domain actually looks like. Moving a page is an edit to one line,
            not a migration — and because the table is code, the URL structure is something you can read in one sitting instead of inferring from a
            tree.
          </p>
        </article>

        <article>
          <h3 className="mb-3 text-lg font-medium text-zinc-900 dark:text-white">HTML elements, not framework re-inventions</h3>
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            Every other framework here reaches a point where an HTML element is no longer good enough and gets replaced by a component of its own. An
            anchor becomes <code>&lt;Link&gt;</code>. An image becomes <code>&lt;Image&gt;</code>. Then <code>&lt;Script&gt;</code>,{' '}
            <code>&lt;Form&gt;</code>, <code>&lt;Head&gt;</code>, a font loader, a lazy-import helper. Each one is a new set of props to learn, a new
            page of documentation, a new way to hold it wrong — and a component that only means anything inside that framework.
          </p>
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            rshono replaces none of them. The elements do their own jobs; the framework works on the outside of them.
          </p>

          <ElementTable />

          <p className="mt-6 mb-4 text-zinc-600 dark:text-zinc-400">
            The mechanism, in each case, is that the build or the runtime meets the element where it already is. Soft navigation is a single{' '}
            <code>click</code> listener on the document that upgrades same-origin anchors, so <code>data-prefetch</code> and <code>data-native</code>
            are attributes rather than props:
          </p>
          <div className="prose mb-4" dangerouslySetInnerHTML={{ __html: linksHtml }} />
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            Assets work the same way round. Importing a <code>.png</code> or a <code>.woff2</code> hands you a content-hashed URL from Rspack&rsquo;s
            asset pipeline, which you put in an ordinary <code>src</code> or <code>@font-face</code>. The server bundle resolves the same import to
            the same URL without emitting the file twice, so a server component can reference an asset as freely as a client one. Nothing wraps the{' '}
            <code>&lt;img&gt;</code>.
          </p>
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            And a page renders the whole document — <code>&lt;html&gt;</code>, <code>&lt;head&gt;</code>, <code>&lt;title&gt;</code>,{' '}
            <code>&lt;meta&gt;</code> — with the build attaching that page&rsquo;s own script and stylesheet tags. So there is no{' '}
            <code>&lt;Head&gt;</code> to import and no <code>&lt;Scripts&gt;</code> to remember to render: metadata is just tags in the head, where
            they have always been.
          </p>

          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            What that buys is not purity. It is that the knowledge transfers — <code>target</code>, <code>rel</code>, <code>download</code>,{' '}
            <code>loading="lazy"</code>, <code>srcset</code>, <code>fetchpriority</code>, <code>enctype</code> and every other attribute work because
            nothing is intercepting them. HTML from outside your components — rendered markdown, a CMS field, a third-party widget, a server-rendered
            email preview — navigates softly and lazy-loads correctly without knowing rshono exists. And all of it degrades to working HTML when the
            JavaScript fails to arrive, because that is what it was.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            Two caveats, since this section is the one most likely to oversell. rshono does export three components — <code>Boundary</code>,{' '}
            <code>ErrorBoundary</code> and <code>NavigationProgress</code> — but none replaces an element: the first two wrap React primitives that
            have no HTML equivalent, and the third is optional chrome you can delete. And the honest cost of no <code>&lt;Image&gt;</code> is that you
            get no resizing, no format negotiation and no blur placeholder either. Next.js and Astro give you those; rshono gives you an{' '}
            <code>&lt;img&gt;</code> and expects you to point it at a CDN that does it. Astro, for its part, takes the plain-anchor idea further than
            we do, by shipping no client router at all.
          </p>
        </article>

        <article>
          <h3 className="mb-3 text-lg font-medium text-zinc-900 dark:text-white">The request is a prop, and the server is a function call</h3>
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            Every page is handed <code>{'{ url, params, ctx }'}</code>. No async accessor to import, no rule about which call makes a route dynamic,
            no cache to reason about — <code>ctx</code> is the live Hono context, and reading a cookie off it is just reading a property. Nested
            components that got no props call <code>getContext()</code> and get the same object.
          </p>
          <div className="prose mb-4" dangerouslySetInnerHTML={{ __html: contextHtml }} />
          <p className="text-zinc-600 dark:text-zinc-400">
            And there is no data-fetching layer between a page and your server code. A page <code>await</code>s your database. A client component
            imports a <code>&lsquo;use server&rsquo;</code> function and calls it with typed arguments. No route handler to write, no fetch wrapper,
            no query client, no serialisation boundary you maintain by hand.
          </p>
        </article>

        <article>
          <h3 className="mb-3 text-lg font-medium text-zinc-900 dark:text-white">A navigation costs a payload, not a document</h3>
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            One URL answers two ways. A hard load gets a streamed HTML document; a soft navigation sends <code>Accept: text/x-component</code> and
            gets the RSC flight payload — the rendered tree, not a new page shell, no re-parse, no re-hydration of what did not change. Client state
            outside the changed subtree survives, and a <code>render: &lsquo;static&rsquo;</code> route is prerendered <em>both ways</em>, so in-app
            clicks hit a file too.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            Which is the RSC bargain generally, and Next.js and Waku make it too. The difference here is how little sits in the path: no
            framework-level data cache, no request memoisation layer, no revalidation model to configure. The payload is what your components
            rendered.
          </p>
        </article>

        <article>
          <h3 className="mb-3 text-lg font-medium text-zinc-900 dark:text-white">One bundler, pinned, in dev and in build</h3>
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            <code>rshono dev</code> and <code>rshono build</code> call the same function to produce the same pair of Rspack configs, and the dev
            server runs <em>the real production server bundle</em> in a worker thread. So there is no dev-only module runner whose resolution differs
            from the build&rsquo;s, and a thing that works in dev works because it is the same code path, not because two pipelines happen to agree
            today.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            <code>@rspack/core</code> and <code>react-server-dom-rspack</code> are pinned to exact versions, not caret ranges: a fresh install cannot
            hand you a different bundler than the one this release was tested against. Moving them is a release of rshono. This is the modest version
            of that claim — Vite closed its own dev/prod gap in Vite 8 by replacing esbuild and Rollup with Rolldown, and Next 16 unified on
            Turbopack. Both are real improvements. Both were also the kind of engine swap underneath an ecosystem that we would rather you never have
            to absorb from us.
          </p>
        </article>

        <article>
          <h3 className="mb-3 text-lg font-medium text-zinc-900 dark:text-white">Platform-independent by construction</h3>
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            Everything that depends on <em>where</em> the app runs — binding a port, serving assets, reading a prerendered page, gzipping, loading{' '}
            <code>.env</code> — sits behind one interface the build resolves per target. The request-handling code has no platform in it, so{' '}
            <code>node</code>, <code>bun</code>, <code>deno</code>, <code>cloudflare</code>, <code>vercel</code>, <code>netlify</code> and{' '}
            <code>aws-lambda</code> are one flag, not one adapter package each. Every one of them streams.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            No framework here is locked to a host, and Astro&rsquo;s adapter story is mature. The difference is that rshono&rsquo;s targets are in the
            framework, tested with it, and released with it — none of them is a community package that may or may not have kept up.
          </p>
        </article>

        <article>
          <h3 className="mb-3 text-lg font-medium text-zinc-900 dark:text-white">An honest framework: the parts are named</h3>
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            rshono does not wrap its foundations in house-branded replacements. The server is a Hono app and you get it — <code>src/server.ts</code>{' '}
            default-exports a whole Hono sub-app, mounted ahead of the pages, so its middleware wraps them too, and <code>hono/client</code> gives you
            end-to-end types from the handlers themselves. The build is an Rspack config and the <code>rspack</code> hook hands it to you. Rendering
            is React Server Components, unrenamed.
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            Which means Hono&rsquo;s documentation is your documentation, Rspack&rsquo;s is too, and what you learn here transfers out. There is also
            no legacy to route around: one router, one rendering model, no earlier generation of the framework still in the API for
            compatibility&rsquo;s sake. The whole framework is about 5,000 lines of TypeScript — nearer 2,800 with comments and blank lines removed —
            which makes &ldquo;read the source&rdquo; a realistic answer to a question about it.
          </p>
        </article>
      </div>
    </section>
  );
}

/**
 * The section that costs us rows.
 *
 * It is here because the claim on the rest of the page is that these numbers are honest, and a reader
 * has no reason to believe that from a page where we win everything.
 *
 * The `id` is what the intro links to. No `scroll-mt` needed — `scroll-padding-top` on `html` already
 * clears the sticky header for a hash jump, site-wide.
 */
function Tradeoffs() {
  return (
    <section id="tradeoffs" className="mx-auto w-full max-w-3xl px-6 py-12">
      <h2 className="mb-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Where the others are ahead</h2>
      <p className="mb-6 text-zinc-600 dark:text-zinc-400">Pick rshono for the reasons above. Do not pick it for these, because they are real.</p>

      <ul className="grid gap-4">
        {[
          {
            title: 'Maturity',
            body: 'rshono is alpha, built on Rspack’s experimental RSC support and a 0.0.x version of react-server-dom-rspack — both pinned exactly, because both move underneath us. Next.js, Astro and TanStack Start are in production at companies you have heard of. If the cost of a sharp edge is high for you, that gap matters more than any row above.',
            href: '/docs/limitations',
            hrefLabel: 'Requirements & limitations',
          },
          {
            title: 'Batteries Next.js includes and rshono does not',
            body: 'Image optimisation, font optimisation, i18n routing, incremental static regeneration, draft mode, a middleware runtime, an analytics story. rshono gives you Hono and expects you to reach for a library. That is fewer decisions made for you, which is the point — and more decisions to make, which is the cost.',
          },
          {
            title: 'TanStack’s typed client router and data layer',
            body: 'If your app is genuinely client-heavy — long-lived state, optimistic updates, search-param-as-state — TanStack Router’s end-to-end typed routes, loaders and search-param schemas are better tools than one useNavigation() hook. rshono’s bet is that the server should hold that state; when that bet is wrong for your app, theirs is the better fit.',
          },
          {
            title: 'Astro for content sites',
            body: 'Content collections, MDX, an image pipeline, integrations for every CMS, and zero client JavaScript by default without thinking about it. If you are building a marketing site or a blog, Astro will get you there with less code than rshono will.',
          },
          {
            title: 'Ecosystem and answers',
            body: 'Every question about Next.js has been asked already. Ours have not. Fewer dependencies and less API also means fewer Stack Overflow answers, fewer example repos, and no plugin ecosystem — the documentation and the source are what you get.',
            href: '/docs',
            hrefLabel: 'Read the docs',
          },
        ].map((item) => (
          <li key={item.title} className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
            <h3 className="mb-2 font-medium text-zinc-900 dark:text-white">{item.title}</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.body}</p>
            {item.href && (
              <p className="mt-3 text-sm">
                <a href={item.href} data-prefetch>
                  {item.hrefLabel} →
                </a>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Method() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pt-4 pb-20">
      <h2 className="mb-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">How these numbers were made</h2>

      <div className="grid gap-4 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Measured on 30 July 2026, macOS on arm64, npm 10.9.7, Node 22.22.2. One empty directory per framework, then{' '}
          <code>npm install --omit=dev --ignore-scripts</code> with the packages listed in the table. <em>Packages</em> is npm&rsquo;s own count for
          that install; <em>on disk</em> is <code>du -sh node_modules</code>. Counts include the platform-specific native binaries npm selected for
          this machine, and would differ by a package or two on another.
        </p>
        <p>
          <em>Public entry points</em> counts the import paths each package publishes — its <code>exports</code> map, or for Next.js, which has none,
          the type-declaration files in its package root. <em>Client navigation hooks</em> and rshono&rsquo;s eleven exports were read off the shipped{' '}
          <code>.d.ts</code> files, not the documentation.
        </p>
        <p>
          The line count is <code>packages/core/src</code>, <code>.ts</code> and <code>.tsx</code> together: 5,068 lines, or 2,811 with blank and
          comment-only lines dropped.
        </p>
        <p>
          Versions as installed: rshono 1.0.0-rc.3, Next.js 16.2.12, TanStack Start 1.168.33, Waku 1.0.0-beta.8, Astro 7.1.6. Frameworks move; if
          something here has gone stale,{' '}
          <a href="https://github.com/rshono/rshono/issues" data-native>
            open an issue
          </a>{' '}
          and it gets corrected.
        </p>
        <p>
          There are no performance benchmarks on this page on purpose. Request throughput is dominated by what a page does, not by whose framework
          wrapped it, and a chart we produced ourselves would tell you about our fixture rather than about your app.
        </p>
      </div>

      <p className="mt-10">
        <a
          href="/docs/getting-started"
          data-prefetch
          className="rounded-lg bg-zinc-900 px-5 py-2.5 font-medium text-white no-underline hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Try it — get started
        </a>
      </p>
    </section>
  );
}
