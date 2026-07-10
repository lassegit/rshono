/**
 * Server module for the /docs/:slug page — PRIVATE, never shipped.
 */
import { defineLoader } from 'rs-hono';
import { fakeDB } from '../db.server';

export const loader = defineLoader('/docs/:slug', async (c) => {
    const slug = c.req.param('slug');
    const doc = await fakeDB.getDoc(slug);
    if (!doc) return c.text(`Doc ${slug} not found`, 404);
    return { doc };
});

/**
 * The docs pages to pre-render at build time (SSG). Slugs not returned
 * here fall back to per-request SSR.
 */
export const staticPaths = async () => (await fakeDB.listDocs()).map(({ slug }) => ({ slug }));
