'use client';

import { Component, Suspense, type ReactNode } from 'react';

/**
 * What an {@link ErrorBoundary} / {@link Boundary} renders once a child throws.
 * Either a static node, or a render function that also gets a `reset` callback
 * to clear the error and re-render the children (e.g. a "Try again" button).
 *
 * The render-function form only works when the boundary is used from a `'use
 * client'` component — functions can't cross the server→client boundary. From a
 * server component, pass a `ReactNode`.
 */
export type ErrorFallback = ReactNode | ((error: Error, reset: () => void) => ReactNode);

export interface ErrorBoundaryProps {
  /**
   * Rendered in place of the children after one of them throws. Omit it to
   * report the error via `onError` and re-throw to the next boundary out (or
   * the global error page) instead of handling it here.
   */
  fallback?: ErrorFallback;
  /** Called with the caught error (for logging / reporting). */
  onError?: (error: Error) => void;
  /**
   * When any value in this array changes while the boundary is showing its
   * fallback, the error is cleared automatically. Pass the current pathname to
   * recover when the user navigates away: `resetKeys={[useNavigation().pathname]}`.
   */
  resetKeys?: readonly unknown[];
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function keysChanged(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
}

/**
 * A general-purpose error boundary. Catches errors thrown while rendering its
 * children — a client island that blew up, or a server component that rejected
 * on a soft navigation — and renders `fallback` in their place instead of
 * tearing down the whole page.
 *
 * It's a `'use client'` component (React error boundaries must be), so drop it
 * anywhere in the tree from a server or client component. Use {@link Boundary}
 * when you also want a Suspense loading fallback in the same wrapper.
 *
 * @example
 * ```tsx
 * import { ErrorBoundary } from 'rshono/client';
 *
 * <ErrorBoundary fallback={(error, reset) => (
 *   <div role="alert">
 *     <p>{error.message}</p>
 *     <button onClick={reset}>Try again</button>
 *   </div>
 * )}>
 *   <RiskyWidget />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    const { resetKeys } = this.props;
    if (this.state.error && prev.resetKeys && resetKeys && keysChanged(prev.resetKeys, resetKeys)) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      const { fallback } = this.props;
      if (fallback === undefined) throw error; // no local fallback → propagate to an outer boundary
      return typeof fallback === 'function' ? fallback(error, this.reset) : fallback;
    }
    return this.props.children;
  }
}

export interface BoundaryProps {
  /** Suspense fallback, shown while the children (or their data) are still loading. */
  loading?: ReactNode;
  /** Error fallback, shown if a child throws. See {@link ErrorFallback}. */
  error?: ErrorFallback;
  /** Called with the caught error. */
  onError?: (error: Error) => void;
  /** Clears the error fallback when any value changes — see {@link ErrorBoundaryProps.resetKeys}. */
  resetKeys?: readonly unknown[];
  children: ReactNode;
}

/**
 * A loading + error boundary in one wrapper — the common case for an async
 * section of a page. It always renders the same shape:
 *
 * ```tsx
 * <ErrorBoundary fallback={error}>
 *   <Suspense fallback={loading}>{children}</Suspense>
 * </ErrorBoundary>
 * ```
 *
 * so `error` catches anything the children throw (including while suspended) and
 * `loading` shows until they resolve. Both fallbacks are optional: omit
 * `loading` and nothing shows while loading; omit `error` and thrown errors
 * propagate to the next boundary out (or the global error page) rather than
 * being caught here.
 *
 * @example
 * ```tsx
 * import { Boundary } from 'rshono/client';
 *
 * <Boundary loading={<Spinner />} error={(e, reset) => <Retry onClick={reset} />}>
 *   <SlowServerComponent />
 * </Boundary>
 * ```
 */
export function Boundary({ loading = null, error, onError, resetKeys, children }: BoundaryProps): ReactNode {
  return (
    <ErrorBoundary fallback={error} onError={onError} resetKeys={resetKeys}>
      <Suspense fallback={loading}>{children}</Suspense>
    </ErrorBoundary>
  );
}
