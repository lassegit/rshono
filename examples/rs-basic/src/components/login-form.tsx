'use client';

import { useActionState } from 'react';
import { login, type LoginState } from '../actions';

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="form">
      {state.error && <p className="notice error">{state.error}</p>}
      <label>
        Email
        <input name="email" type="email" placeholder="ada@example.com" />
      </label>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
