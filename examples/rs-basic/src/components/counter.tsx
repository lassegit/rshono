'use client';

import { useEffect, useState } from 'react';
import { readSecretFromHelper } from '../leak-helper';

export function Counter() {
  const [count, setCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  console.log(process.env);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div className="feature-card" style={{ margin: '1.5rem auto', maxWidth: '28rem' }}>
      <h3>Client Island {hydrated ? '(hydrated ✓)' : '(hydrating…)'}</h3>
      <p>
        <button className="btn" onClick={() => setCount((n) => n + 1)}>
          Clicked {count} time{count === 1 ? '' : 's'}
        </button>
      </p>
      <p className="meta">
        PUBLIC_API_ENDPOINT: <code>{process.env.PUBLIC_API_ENDPOINT ?? '(not set)'}</code>
        <br />
        DATABASE_URL: <code>{process.env.DATABASE_URL ?? '(stripped from the client bundle ✓)'}</code>
        <br />
        Using leak helper: {readSecretFromHelper()}
      </p>
    </div>
  );
}
