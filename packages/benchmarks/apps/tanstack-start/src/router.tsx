import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

/**
 * The plugin resolves `src/router` and registers `Awaited<ReturnType<typeof getRouter>>` as the app's
 * router type, so the export name is part of the contract.
 *
 * `defaultPreload` is left off: rshono's `<a>` only prefetches with an explicit `data-prefetch`, and
 * a framework that prefetches every visible link by default would be doing strictly more network work
 * than the other two for the same page.
 */
export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true });
}
