import { DOC_SECTIONS } from '../content/docs';

/**
 * The documentation nav, grouped by section.
 *
 * Pure markup and no client JavaScript: the current page is known on the server, and the mobile
 * disclosure is a `<details>` element, which opens and closes on its own.
 */
export function DocsSidebar({ currentSlug }: { currentSlug: string }) {
  return (
    <>
      {/* Desktop: a sticky rail beside the prose. */}
      <nav aria-label="Documentation" className="sticky top-14 hidden max-h-[calc(100vh-3.5rem)] overflow-y-auto py-10 pr-6 text-sm lg:block">
        <SectionList currentSlug={currentSlug} />
      </nav>

      {/* Mobile: the same list, behind a disclosure that needs no script to work. */}
      <details className="group border-b border-zinc-200 lg:hidden dark:border-zinc-800">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-6 py-3 text-sm font-medium text-zinc-900 dark:text-white">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="transition-transform group-open:rotate-90">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Documentation menu
        </summary>
        <div className="px-6 pb-5 text-sm">
          <SectionList currentSlug={currentSlug} />
        </div>
      </details>
    </>
  );
}

function SectionList({ currentSlug }: { currentSlug: string }) {
  return (
    <ul className="space-y-6">
      {DOC_SECTIONS.map((section) => (
        <li key={section.title}>
          <h2 className="mb-2 text-xs font-semibold tracking-wider text-zinc-900 uppercase dark:text-white">{section.title}</h2>
          <ul className="space-y-px border-l border-zinc-200 dark:border-zinc-800">
            {section.docs.map((doc) => {
              const current = doc.slug === currentSlug;
              return (
                <li key={doc.slug}>
                  <a
                    href={doc.href}
                    aria-current={current ? 'page' : undefined}
                    className={
                      current
                        ? '-ml-px block border-l border-sky-600 py-1 pl-4 font-medium text-sky-700 no-underline dark:border-sky-400 dark:text-sky-300'
                        : '-ml-px block border-l border-transparent py-1 pl-4 text-zinc-600 no-underline hover:border-zinc-400 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-white'
                    }
                  >
                    {doc.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
