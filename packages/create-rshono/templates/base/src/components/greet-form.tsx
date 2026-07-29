'use client';

import { useActionState } from 'react';
import { greet } from '../actions';

/**
 * The client half. `'use client'` is the boundary: this module ships to the browser and hydrates, while
 * everything that only renders it stays on the server.
 *
 * Wiring the action to `<form action>` means it works before hydration and with JavaScript switched off
 * — the browser posts the form, the server runs the action and answers with a fresh page. That is what
 * progressive enhancement buys, and it costs nothing here.
 */
export function GreetForm() {
  const [message, action, pending] = useActionState(greet, null);

  return (
    <form action={action}>
      <label htmlFor="name">Your name</label>
      <input id="name" name="name" placeholder="Ada" autoComplete="off" />
      <button type="submit" disabled={pending}>
        {pending ? 'Saying hello…' : 'Say hello'}
      </button>
      {message && <output>{message}</output>}
    </form>
  );
}
