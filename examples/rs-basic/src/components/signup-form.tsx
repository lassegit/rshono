'use client';

import { useActionState } from 'react';
import { signup, type SignupState } from '../actions.server';

const initialState: SignupState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <form action={formAction} className="form">
      {state.message && <p className="notice success">{state.message}</p>}
      {state.error && <p className="notice error">{state.error}</p>}

      <label>
        Name
        <input name="name" type="text" placeholder="Ada Lovelace" />
      </label>
      <label>
        Email
        <input name="email" type="email" placeholder="ada@example.com" />
      </label>

      <button className="btn" type="submit" disabled={pending}>
        {pending ? 'Signing up…' : 'Sign up'}
      </button>
    </form>
  );
}
