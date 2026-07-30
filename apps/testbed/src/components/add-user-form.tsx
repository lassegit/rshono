'use client';

import { useState, useTransition } from 'react';
import { createUser } from '../actions';

export function AddUserForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await createUser({ name, email });
        setName('');
        setEmail('');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="form">
      <h3>Add a user (server action)</h3>
      {error && <p className="notice error">{error}</p>}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grace Hopper" />
      </label>
      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="grace@example.com" />
      </label>
      <button className="btn" onClick={submit} disabled={pending}>
        {pending ? 'Adding…' : 'Add user'}
      </button>
    </div>
  );
}
