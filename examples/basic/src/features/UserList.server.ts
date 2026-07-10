/**
 * Server module for the /users page — PRIVATE, never shipped.
 */
import { defineLoader } from 'rs-hono';
import { fakeDB } from '../db.server';

export const loader = defineLoader('/users', async () => {
    const users = await fakeDB.listUsers();
    return { users };
});
