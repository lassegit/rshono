'use client';

import { useEffect } from 'react';

/**
 * Adds a copy button to every code block on the page.
 *
 * The only client JavaScript a documentation page ships. It has to work this way round — imperatively,
 * against the DOM — because the prose is finished HTML injected with `dangerouslySetInnerHTML`, so
 * there are no React elements for the code blocks to hang a button off.
 *
 * Renders nothing itself; it is mounted purely for the effect.
 */
export function CodeCopyButtons({ slug }: { slug: string }) {
  useEffect(() => {
    const blocks = document.querySelectorAll<HTMLPreElement>('#content pre.shiki');
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const added: HTMLButtonElement[] = [];

    for (const block of blocks) {
      const code = block.textContent ?? '';
      if (!code.trim()) continue;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy';
      button.textContent = 'Copy';
      button.setAttribute('aria-label', 'Copy code to clipboard');

      const copy = async () => {
        try {
          await navigator.clipboard.writeText(code);
          button.textContent = 'Copied';
          button.dataset.copied = 'true';
        } catch {
          // Clipboard access can be refused outright (insecure context, denied permission). Saying so
          // beats a button that silently does nothing.
          button.textContent = 'Press ⌘C';
        }
        const timer = setTimeout(() => {
          button.textContent = 'Copy';
          delete button.dataset.copied;
          timers.delete(timer);
        }, 2000);
        timers.add(timer);
      };

      // `void`, not an `async` listener: a listener's return value is discarded, so a rejection from an
      // async one becomes an unhandled rejection rather than an error anybody sees. `copy` handles its
      // own failure, and this says that discarding the promise is deliberate.
      button.addEventListener('click', () => void copy());

      block.appendChild(button);
      added.push(button);
    }

    return () => {
      for (const timer of timers) clearTimeout(timer);
      // Soft navigation reuses the document, so buttons from the previous page have to go — otherwise
      // every visit leaves another one behind on blocks that survived the reconcile.
      for (const button of added) button.remove();
    };
    // Re-runs per page: a soft navigation swaps the prose underneath a component that stays mounted.
  }, [slug]);

  return null;
}
