import { createFileRoute } from '@tanstack/react-router';

/**
 * APP_SPEC.md: no React on this path at all — router and response construction only.
 *
 * A route whose only prop is `server` is pruned from the client route tree entirely, so this costs
 * the browser nothing.
 */
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => Response.json({ ok: true, route: 'health' }),
    },
  },
});
