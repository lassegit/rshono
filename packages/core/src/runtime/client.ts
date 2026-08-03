/**
 * `@rshono/core/client` — the browser-side surface, for use from `'use client'`
 * modules: {@link useNavigation} for the current URL and soft navigation, and
 * {@link Boundary} / {@link ErrorBoundary} as components.
 *
 * Every export is itself a `'use client'` module, so a server component can
 * render {@link Boundary} directly — but the hook needs a client component. In a
 * server component, read the same request data from `getContext()` in
 * `@rshono/core/server`.
 *
 * @packageDocumentation
 */

export { useNavigation, type Navigation, type Router } from './navigation.js';
export { Boundary, ErrorBoundary, type BoundaryProps, type ErrorBoundaryProps, type ErrorFallback } from './boundaries.js';
