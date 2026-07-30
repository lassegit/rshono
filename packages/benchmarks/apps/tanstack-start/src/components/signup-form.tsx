import { useState } from 'react';
import { signup, type SignupResult } from '../server-fns';

/**
 * Same component as the other two apps, with the one difference the framework forces: a
 * `createServerFn` is called with `{ data }` rather than positional arguments.
 */
export function SignupForm() {
  const [result, setResult] = useState<SignupResult | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setResult(await signup({ data: { name: String(form.get('name') ?? ''), email: String(form.get('email') ?? '') } }));
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
