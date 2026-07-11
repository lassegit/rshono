/**
 * Server module for the /users page — PRIVATE, never shipped.
 */
import { env } from 'hono/adapter';
import { defineLoader } from 'rs-hono';
import { fakeDB } from '../db.server';

export const loader = defineLoader('/users', async (c) => {
    const users = await fakeDB.listUsers();

    const { DATABASE_URL } = env<{ DATABASE_URL: string }>(c);
    const { PUBLIC_API_ENDPOINT } = env<{ PUBLIC_API_ENDPOINT: string }>(c);
    console.log({ DATABASE_URL, PUBLIC_API_ENDPOINT });

    return { users };
});
