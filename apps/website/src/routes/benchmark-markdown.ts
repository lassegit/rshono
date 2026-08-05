import type { Handler } from 'hono';
import source from '../../content/benchmarks.md';
import { MARKDOWN_HEADERS } from './llms';

/**
 * `/benchmarks.md` — the results table as its own markdown source, the same way every docs page is.
 *
 * Worth having for this page in particular: the tables are the thing someone would paste into an issue
 * or hand to a model, and a copy taken from the rendered HTML loses the alignment that makes them
 * readable.
 */
export const handler: Handler = (c) => c.body(source, 200, MARKDOWN_HEADERS);
