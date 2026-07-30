'use client';

import { useActionState } from 'react';
import { crash, type CrashState } from '../actions';

const initialState: CrashState = {};

export function CrashForm() {
  const [, formAction, pending] = useActionState(crash, initialState);

  return (
    <form action={formAction} className="form">
      <button className="btn" type="submit" disabled={pending}>
        {pending ? 'Crashing…' : 'Trigger a server error'}
      </button>
    </form>
  );
}
