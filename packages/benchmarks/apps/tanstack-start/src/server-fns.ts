/**
 * The fixture is reached through server functions rather than imported into components directly. A
 * component in a client-router framework runs in the browser too, so a direct import would bundle all
 * 100 users into the client graph — and the payload numbers would then be measuring a mistake rather
 * than the framework. This is the idiomatic route: the data crosses the wire as data.
 */
import { createServerFn } from '@tanstack/react-start';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  score: number;
}

export interface SignupResult {
  ok: boolean;
  id?: number;
  error?: string;
}

/** The whole fixture, for a caller that wants the rows rather than a rendered table. */
export const getUsers = createServerFn().handler(async () => {
  const { users, summary } = await import('./data');
  return { users, summary };
});

/**
 * Validates and returns. Deliberately does not mutate — APP_SPEC.md requires a benchmark run to be
 * idempotent.
 */
export const signup = createServerFn({ method: 'POST' })
  .validator((input: { name: string; email: string }) => input)
  .handler(async ({ data }): Promise<SignupResult> => {
    const { users } = await import('./data');
    if (!data.name.trim()) return { ok: false, error: 'Name is required.' };
    if (!data.email.includes('@')) return { ok: false, error: 'A valid email is required.' };
    return { ok: true, id: users.length + 1 };
  });
