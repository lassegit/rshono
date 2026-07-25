/**
 * `rshono/client` — the browser-side surface, for use from `'use client'`
 * modules: {@link useNavigation} for the current URL and soft navigation, and
 * {@link Boundary} / {@link ErrorBoundary} / {@link NavigationProgress} as
 * components.
 *
 * Every export is itself a `'use client'` module, so a server component can
 * render {@link Boundary} or {@link NavigationProgress} directly — but the hook
 * needs a client component. In a server component, read the same request data
 * from `getContext()` in `rshono/server`.
 *
 * @packageDocumentation
 */

export { NavigationProgress, useNavigation, type Navigation, type NavigationProgressProps, type Router } from './navigation.js';
export { Boundary, ErrorBoundary, type BoundaryProps, type ErrorBoundaryProps, type ErrorFallback } from './boundaries.js';
