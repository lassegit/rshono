import type { PageProps } from '@rshono/core';
import { DOC_SECTIONS } from '../content/docs';
import { Layout } from './layout';

/** `/docs` — every page in one place, for people who would rather scan than click through a sidebar. */
export default function DocsIndex({ url }: PageProps<'/docs'>) {
  return (
    <Layout title="Documentation" description="Everything rshono does, from the one required file to the seven deploy targets." canonical={url.href}>
      <h1 className="mb-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">Documentation</h1>
      <p className="mb-12 text-lg text-zinc-600 dark:text-zinc-400">
        Every page is also served as its own Markdown source — append <code>.md</code> to any URL, or start from{' '}
        <a href="/llms.txt" data-native>
          llms.txt
        </a>
        .
      </p>

      {DOC_SECTIONS.map((section) => (
        <section key={section.title} className="mb-12">
          <h2 className="mb-4 text-xs font-semibold tracking-wider text-zinc-900 uppercase dark:text-white">{section.title}</h2>
          <ul className="grid gap-3">
            {section.docs.map((doc) => (
              <li key={doc.slug}>
                <a
                  href={doc.href}
                  data-prefetch
                  className="block rounded-lg border border-zinc-200 px-4 py-3 no-underline hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  <span className="block font-medium text-zinc-900 dark:text-white">{doc.title}</span>
                  <span className="block text-sm text-zinc-600 dark:text-zinc-400">{doc.description}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Layout>
  );
}
