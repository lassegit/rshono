import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

/**
 * The plugin resolves `src/router` and registers `Awaited<ReturnType<typeof getRouter>>` as the app's
 * router type, so the export name is part of the contract.
 *
 * `defaultPreload` is left off: neither of the other two apps prefetches anything, and a framework
 * preloading every visible link by default would be doing strictly more network work than they do for
 * the same page.
 */
export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true });
}
