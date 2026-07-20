'use client';

import { useEffect, useState } from 'react';

/**
 * A client component island: hydrated in the browser, keeps its state
 * across soft navigations and server-component refreshes.
 *
 * Also demos the env contract — in the client bundle `process.env` is
 * replaced with the PUBLIC_-filtered literal, so the secret reads as
 * undefined while the public var is inlined.
 */
export function Counter() {
  const [count, setCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

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
      </p>
    </div>
  );
}

// edit 1784198216827

// edit 1784198242152

// e 1784198290479

// edit 1784198328874

// edit 1784198410165
