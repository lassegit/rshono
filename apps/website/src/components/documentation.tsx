import type { PageProps } from '@rshono/core';
import { notFound } from '@rshono/core/server';
import { docNeighbours, getDoc } from '../content/docs';
import { renderDoc } from '../content/markdown';
import { CodeCopyButtons } from './code-copy';
import { DocsSidebar } from './docs-sidebar';
import { DocsToc } from './docs-toc';
import { Layout } from './layout';

/**
 * One documentation page.
 *
 * `render: 'static'` in `routes.ts`, so everything below — parsing the markdown, running Shiki over
 * every fenced block, building the table of contents — happens once at build time. What a browser gets
 * is finished HTML plus one small [copy-button island](./code-copy.tsx).
 *
 * That also means no `ctx`: a prerendered page has no request to read one from. `url` is the build-time
 * URL, which is the right canonical only because `siteUrl` is set in `rshono.config.ts`.
 */
export default async function Documentation({ params, url }: PageProps<'/docs/:slug'>) {
  const doc = getDoc(params.slug);

  /*
   * A slug outside `staticPaths` was never prerendered, so it arrives here as a per-request render.
   * `notFound()` throws a control signal the framework turns into the 404 page with a 404 status —
   * rendering a "not found" body inline would answer 200, which is exactly the soft 404 that keeps
   * a dead URL in a search index.
   */
  if (!doc) notFound();

  const { html, toc } = await renderDoc(doc.source);
  const { previous, next } = docNeighbours(doc.slug);

  return (
    <Layout title={doc.title} description={doc.description} canonical={url.href} wide>
      <div className="mx-auto w-full max-w-7xl px-0 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8 lg:px-6 xl:grid-cols-[16rem_minmax(0,1fr)_15rem]">
        <DocsSidebar currentSlug={doc.slug} />

        <article className="min-w-0 px-6 py-10 lg:px-0">
          <header className="mb-8">
            <p className="mb-2 text-sm font-medium text-sky-700 dark:text-sky-400">{doc.section}</p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">{doc.title}</h1>
            {doc.description && <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">{doc.description}</p>}
          </header>

          {/*
            The markdown is ours, rendered at build time from files in this repository — not user input.
            markdown-it runs with `html: true` for the same reason.
          */}
          <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />

          <DocFooterNav previous={previous} next={next} />
        </article>

        <DocsToc toc={toc} markdownHref={doc.markdownHref} />
      </div>

      <CodeCopyButtons slug={doc.slug} />
    </Layout>
  );
}

function DocFooterNav({ previous, next }: ReturnType<typeof docNeighbours>) {
  if (!previous && !next) return null;

  return (
    <nav aria-label="Pagination" className="mt-16 grid gap-4 border-t border-zinc-200 pt-8 sm:grid-cols-2 dark:border-zinc-800">
      {previous ? (
        <a
          href={previous.href}
          data-prefetch
          className="rounded-lg border border-zinc-200 px-4 py-3 no-underline hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">← Previous</span>
          <span className="block font-medium text-zinc-900 dark:text-white">{previous.title}</span>
        </a>
      ) : (
        <span />
      )}
      {next && (
        <a
          href={next.href}
          data-prefetch
          className="rounded-lg border border-zinc-200 px-4 py-3 text-right no-underline hover:border-zinc-300 hover:bg-zinc-50 sm:col-start-2 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">Next →</span>
          <span className="block font-medium text-zinc-900 dark:text-white">{next.title}</span>
        </a>
      )}
    </nav>
  );
}
