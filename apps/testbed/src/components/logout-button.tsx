'use client';

import { useTransition } from 'react';
import { logout } from '../actions';

/**
 * A client-initiated server action that redirects — the counterpart to the `<form>` on `/login`, which
 * redirects over plain HTTP. Here the browser is holding a live React tree, so the framework answers
 * the action POST with a flight payload carrying `redirect` and the client runtime navigates itself.
 */
export function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button className="btn" onClick={() => startTransition(async () => void (await logout()))} disabled={pending}>
      {pending ? 'Logging out…' : 'Log out'}
    </button>
  );
}
