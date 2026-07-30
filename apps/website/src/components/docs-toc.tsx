import type { TocEntry } from '../content/markdown';

/**
 * The on-page table of contents.
 *
 * The ids come out of the same token stream the HTML was rendered from, so a link here always has a
 * heading to land on — see `content/markdown.ts`. `scroll-smooth` on `<html>` is what makes the jump
 * animate, again with no script.
 */
export function DocsToc({ toc, markdownHref }: { toc: TocEntry[]; markdownHref: string }) {
  return (
    <nav aria-label="On this page" className="sticky top-14 hidden max-h-[calc(100vh-3.5rem)] overflow-y-auto py-10 pl-6 text-sm xl:block">
      {toc.length > 0 && (
        <>
          <h2 className="mb-3 text-xs font-semibold tracking-wider text-zinc-900 uppercase dark:text-white">On this page</h2>
          <ul className="space-y-1.5 border-l border-zinc-200 dark:border-zinc-800">
            {toc.map((entry) => (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  className={
                    entry.depth === 3
                      ? '-ml-px block border-l border-transparent py-0.5 pl-7 text-zinc-500 no-underline hover:border-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-white'
                      : '-ml-px block border-l border-transparent py-0.5 pl-4 text-zinc-600 no-underline hover:border-zinc-400 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-white'
                  }
                >
                  {entry.text}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {/*
        Every page is also served as its own markdown source. Worth surfacing rather than leaving to
        `llms.txt`: it is the fastest way to paste an accurate page into an issue or a model.
      */}
      <a
        href={markdownHref}
        data-native
        className="mt-6 inline-flex items-center gap-1.5 text-xs text-zinc-500 no-underline hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M9 2H4.5A1.5 1.5 0 003 3.5v9A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V6L9 2z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        View as Markdown
      </a>
    </nav>
  );
}
