'use client';

import { useEffect } from 'react';

/** Where the choice is kept. Namespaced, because a docs site shares an origin with nothing else here. */
const STORAGE_KEY = 'rshono:pm';

/**
 * A package manager id, and never anything else.
 *
 * The value comes out of `localStorage`, which anything on this origin can write — and it is interpolated
 * into a selector and an attribute name below. Ids are lowercase words, so anything that is not one is
 * not a package manager we render a panel for.
 */
function storedChoice(): string | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && /^[a-z]+$/.test(value) ? value : undefined;
  } catch {
    // Reading storage can throw outright — Safari's private mode, a blocked third-party context. A
    // reader who cannot be remembered still gets the npm default and working tabs.
    return undefined;
  }
}

/**
 * Remembers which package manager the reader picked, and applies it to every selector on the page.
 *
 * Deliberately the smaller half of the feature: the [selectors](../content/package-managers.ts) are
 * radios switched by CSS, so they work with this island absent. What CSS cannot do is carry a choice
 * from one selector to the next, or from one page to the next, and that is all this adds.
 *
 * Imperative, against the DOM, for the same reason the [copy buttons](./code-copy.tsx) are: most of the
 * markup it touches arrives as finished HTML injected with `dangerouslySetInnerHTML`, so there are no
 * React elements to hang state off. It renders nothing itself.
 *
 * A remembered choice is applied on hydration rather than during the first paint, so a reader who chose
 * pnpm sees npm for an instant. The alternative is a blocking script in `<head>`, which is a real cost on
 * every page for a cosmetic gain on some.
 */
export function PackageManagerChoice({ page }: { page: string }) {
  useEffect(() => {
    /** Radios first, then the places that have no radios of their own. */
    const apply = (pm: string) => {
      for (const group of document.querySelectorAll('[data-pm-tabs]')) {
        const radio = group.querySelector<HTMLInputElement>(`input[data-pm-radio][value="${pm}"]`);
        if (radio) radio.checked = true;
      }

      for (const inline of document.querySelectorAll('[data-pm-command]')) {
        const command = inline.getAttribute(`data-pm-${pm}`);
        if (command) inline.textContent = command;
      }
    };

    const stored = storedChoice();
    if (stored) apply(stored);

    /*
     * One delegated listener rather than one per radio: the groups are injected HTML, and on a soft
     * navigation the whole set of them is replaced. Delegation means nothing to re-attach.
     */
    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.matches('[data-pm-tabs] input[data-pm-radio]')) return;

      apply(target.value);
      try {
        localStorage.setItem(STORAGE_KEY, target.value);
      } catch {
        // Storage can be full or refused. The page still switched; only the memory of it is lost.
      }
    };

    document.addEventListener('change', onChange);
    return () => document.removeEventListener('change', onChange);
    // Re-runs per page: a soft navigation brings in selectors that have never been told the choice.
  }, [page]);

  return null;
}
