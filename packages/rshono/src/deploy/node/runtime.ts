import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import { parentPort, workerData } from 'node:worker_threads';
import { onShutdown } from '../../server/shutdown.js';
import type { DeployRuntime } from '../contract.js';
import { fileSystemRuntime } from '../filesystem.js';
import { listenAddress, readyMessage } from '../listen.js';

/**
 * Node: a long-lived process that owns its own port, with a filesystem behind every asset. The shape
 * the framework was built against, and the only target `rshono dev` ever produces.
 */
export const runtime: DeployRuntime = {
  ...fileSystemRuntime,

  serveApp(app: Hono): undefined {
    // `rshono build` imports this bundle to prerender `render: 'static'` routes. That pass renders
    // through `app.fetch` directly and must not bind a port — nothing is listening for it, and the
    // build would never exit.
    if (process.env.RSHONO_PRERENDER) return;

    // The dev server runs this bundle in a worker thread and picks the port itself, so its choice wins
    // over both the environment and the config file.
    const devWorker = workerData as { port?: number; hostname?: string } | null;
    const address = listenAddress(devWorker ?? undefined);

    const server = serve({ fetch: app.fetch, ...address }, (info) => {
      if (parentPort) {
        parentPort.postMessage({ type: 'ready', port: info.port });
      } else {
        console.log(readyMessage({ ...address, port: info.port }));
      }
    });

    onShutdown(() => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    });
  },
};
