'use client';

import { useEffect, useState } from 'react';
import { useNavigation } from '@rshono/core/client';

/**
 * A top progress bar for soft navigations, so a slow page still feels answered.
 *
 * This used to be a `@rshono/core/client` export. It reads nothing but `router.pending`, so it was app
 * code with styling opinions that happened to ship inside the framework — it lives here now, where its
 * colour and height are this site's business rather than a framework option.
 */
export function NavigationProgress() {
  const { router } = useNavigation();
  const [bar, setBar] = useState({ width: 0, opacity: 0 });

  useEffect(() => {
    if (router.pending) {
      // Jump in, then creep toward — but never reach — the end while we wait.
      setBar({ width: 15, opacity: 1 });
      const ramp = setTimeout(() => setBar({ width: 85, opacity: 1 }), 80);
      return () => clearTimeout(ramp);
    }
    // Done: snap to full, then fade out. (No-op if it was never shown.)
    setBar((current) => (current.opacity === 0 ? current : { width: 100, opacity: 1 }));
    const hide = setTimeout(() => setBar({ width: 0, opacity: 0 }), 220);
    return () => clearTimeout(hide);
  }, [router.pending]);

  return (
    <div
      data-rshono-progress=""
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: 3,
        width: `${bar.width}%`,
        opacity: bar.opacity,
        background: '#3b82f6',
        zIndex: 2147483647,
        pointerEvents: 'none',
        transition: 'width 200ms ease-out, opacity 200ms ease-out',
      }}
    />
  );
}
