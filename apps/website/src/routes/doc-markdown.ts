import type { Handler } from '@rshono/core';
import { getDoc } from '../content/docs';

/**
 * `/docs/:slug.md` — the source of a documentation page, verbatim.
 *
 * Frontmatter included: the point is to hand over exactly what the site was built from, so a page
 * pasted into an issue or a model carries its own title and description with it.
 *
 * The content is bundled (see the `asset/source` rule in `rshono.config.ts`) rather than read off disk,
 * so this works unchanged on a deploy target with no filesystem — and it is the same string the
 * prerender parsed into HTML, which is what keeps the two representations honest.
 */
export const handler: Handler = (c) => {
  // The route pattern captures the `.md` along with the slug — Hono reads a bare `:slug.md` as a param
  // *named* `slug.md` that matches any segment, so the suffix has to be in the pattern's regex and
  // stripped back off here.
  const doc = getDoc((c.req.param('slug') ?? '').replace(/\.md$/, ''));

  // Plain text rather than the HTML 404 page: whoever asked for `.md` wants something they can read,
  // not a document. `llms.txt` is the useful thing to point them at.
  if (!doc) {
    return c.text(`No documentation page at ${c.req.path}\n\nSee /llms.txt for the full index.\n`, 404, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
  }

  return c.body(doc.source, 200, {
    // `charset` matters: the docs are full of em dashes and arrows.
    'Content-Type': 'text/markdown; charset=utf-8',
    // Matches what a prerendered page gets, since this is just as static.
    'Cache-Control': 'public, max-age=300',
  });
};
