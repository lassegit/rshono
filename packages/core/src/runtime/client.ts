/**
 * `@rshono/core/client` — the browser-side surface, for use from `'use client'`
 * modules: {@link useNavigation} for the current URL and soft navigation, and
 * {@link AsyncBoundary} / {@link CatchBoundary} as components.
 *
 * Every export is itself a `'use client'` module, so a server component can
 * render {@link AsyncBoundary} directly — but the hook needs a client component. In a
 * server component, read the same request data from `getRequestContext()` in
 * `@rshono/core/server`.
 *
 * @packageDocumentation
 */

export { useNavigation, type NavigationRouter, type NavigationState } from './navigation.js';
export { AsyncBoundary, CatchBoundary, type AsyncBoundaryProps, type CatchBoundaryProps, type ErrorFallback } from './boundaries.js';
