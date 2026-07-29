import type { Hono } from 'hono';
import type { DeployRuntime } from '../contract.js';
import { fileSystemRuntime } from '../filesystem.js';
import { listenAddress, readyMessage } from '../listen.js';

/**
 * Bun: a long-lived process like Node, but the runtime — not the app — opens the socket. Bun reads
 * `fetch`, `port` and `hostname` off the module's default export and serves it, so there is nothing to
 * bind here and no server handle to close on shutdown.
 *
 * Everything else is Node's: Bun implements the `node:` APIs `server/` uses, so assets, gzip and
 * `.env` loading are the same code.
 */
export const runtime: DeployRuntime = {
  ...fileSystemRuntime,

  serveApp(app: Hono): unknown {
    const address = listenAddress();
    // The prerender pass imports this bundle; returning the export is inert either way, so unlike the
    // Node preset there is nothing to suppress. Only the log line is worth skipping.
    if (!process.env.RSHONO_PRERENDER) console.log(readyMessage(address));
    return { fetch: app.fetch, ...address };
  },
};
