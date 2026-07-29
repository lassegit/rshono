import type { Hono } from 'hono';
import type { DeployRuntime } from '../contract.js';
import { fileSystemRuntime } from '../filesystem.js';

/**
 * Deno: `deno serve` and Deno Deploy both look for a `fetch` on the default export, so the handoff is
 * an export rather than a listener — which is also what makes one build work for both.
 *
 * The compiler settings stay Node's deliberately. Deno's `node:` compatibility covers everything
 * `server/` uses, so the Node builds of React and the RSC runtime run as-is, and the alternative would
 * be a second bundle shape to keep working for no behavioural gain.
 */
export const runtime: DeployRuntime = {
  ...fileSystemRuntime,

  serveApp(app: Hono): unknown {
    return { fetch: app.fetch };
  },
};
