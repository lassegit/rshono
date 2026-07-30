'use client';

import { useState } from 'react';
import { signup, type SignupResult } from '../actions';

/**
 * Calls the server function directly from client code and renders what came back.
 *
 * Deliberately not `useActionState` / `<form action={fn}>`, even though rshono and Next both support
 * it: TanStack Start has no equivalent, and a benchmark comparing three client bundles has to have
 * the same client component in all three. Progressive enhancement is a real rshono feature — it is
 * just not a thing this benchmark can measure fairly, so it is out of scope rather than half-in.
 */
export function SignupForm() {
  const [result, setResult] = useState<SignupResult | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setResult(await signup({ name: String(form.get('name') ?? ''), email: String(form.get('email') ?? '') }));
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="row">
        <input name="name" placeholder="Name" aria-label="Name" />
        <input name="email" placeholder="Email" aria-label="Email" />
        <button type="submit" disabled={pending}>
          {pending ? 'Submitting…' : 'Submit'}
        </button>
      </div>
      {result && <p className="summary">{result.ok ? `Created user #${result.id}` : result.error}</p>}
    </form>
  );
}
