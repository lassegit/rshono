'use server';

import { users } from './data';

export interface SignupResult {
  ok: boolean;
  id?: number;
  error?: string;
}

/**
 * Validates and returns. Deliberately does not mutate `users` — APP_SPEC.md requires a benchmark run
 * to be idempotent, and a growing array would make later iterations render more than earlier ones.
 */
export async function signup(input: { name: string; email: string }): Promise<SignupResult> {
  if (!input.name.trim()) return { ok: false, error: 'Name is required.' };
  if (!input.email.includes('@')) return { ok: false, error: 'A valid email is required.' };
  return { ok: true, id: users.length + 1 };
}
