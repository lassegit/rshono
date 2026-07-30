'use client';

import { useState } from 'react';

/** The minimal hydration unit: one piece of state, one handler. Identical in all three apps. */
export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="row">
      <button onClick={() => setCount((n) => n + 1)}>Increment</button>
      <span>
        Clicked {count} time{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}
