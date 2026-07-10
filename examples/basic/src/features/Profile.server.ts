/**
 * Server module for the /profile/:id page — PRIVATE, never shipped.
 *
 * The path pattern given to defineLoader types `c` (param('id') is a
 * plain string) and is validated against the route's path in routes.ts.
 * Profile.tsx derives its props from `typeof loader`.
 */
import { defineLoader } from 'rs-hono';
import { fakeDB } from '../db.server';

export const loader = defineLoader('/profile/:id', async (c) => {
    const id = c.req.param('id');
    const user = await fakeDB.getUser(id);
    // A loader may return a Response to short-circuit rendering —
    // a proper 404 instead of a 500 error page (redirects work too).
    if (!user) return c.text(`User ${id} not found`, 404);
    const posts = await fakeDB.getUserPosts(id);
    return { user, posts };
});
