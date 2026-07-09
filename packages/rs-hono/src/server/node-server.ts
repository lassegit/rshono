/**
 * HTTP server lifecycle around @hono/node-server.
 *
 * The official adapter does the Node ↔ fetch bridging (request/response
 * streaming, set-cookie handling, backpressure). This wrapper adds what
 * the CLI commands need on top: port retry under `tsx watch`, and
 * graceful vs fast shutdown.
 */
import { serve as nodeServe } from '@hono/node-server';
import type { Server } from 'node:http';

export interface ServeOptions {
    fetch: (req: Request) => Response | Promise<Response>;
    port: number;
    /** e.g. "127.0.0.1" for dev. Omit to listen on all interfaces (prod). */
    hostname?: string;
    /** Extra cleanup to run on SIGINT/SIGTERM (e.g. close a bundler watcher). */
    onShutdown?: () => void | Promise<void>;
    /**
     * true (default): drain connections on shutdown (production).
     * false: exit fast — required under `tsx watch`, which restarts the
     * process on file change and needs the port released immediately.
     */
    graceful?: boolean;
}

export async function serve(options: ServeOptions): Promise<Server> {
    const { fetch, port, hostname, onShutdown, graceful = true } = options;

    const server = await new Promise<Server>((resolve, reject) => {
        const srv = nodeServe({ fetch, port, hostname }, () => resolve(srv)) as Server;

        // A few retries so a dev-server restart can grab the port the
        // previous process is still releasing.
        let attempt = 0;
        srv.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                if (!graceful && ++attempt < 10) {
                    setTimeout(() => srv.listen(port, hostname), 200);
                    return;
                }
                console.error(`  ✗ Port ${port} is already in use.`);
                console.error(`    Try: --port ${port + 1}`);
                process.exit(1);
            }
            reject(err);
        });
    });

    installShutdown(server, onShutdown, graceful);
    return server;
}

function installShutdown(server: Server, onShutdown: (() => void | Promise<void>) | undefined, graceful: boolean): void {
    let shuttingDown = false;

    const shutdown = (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;

        if (!graceful) {
            // Dev: release the port immediately so the restarted process
            // (tsx watch) can bind it. Nothing worth draining in dev.
            server.closeAllConnections();
            server.close();
            Promise.resolve(onShutdown?.()).finally(() => process.exit(0));
            setTimeout(() => process.exit(0), 500);
            return;
        }

        console.log(`\n  ${signal} received — shutting down...`);

        // Without this, browsers' keep-alive connections make close() hang
        // until the force-exit timeout on every Ctrl+C.
        server.closeIdleConnections();

        server.close(async (err) => {
            if (err) console.error('  Server close error:', err);
            try {
                await onShutdown?.();
            } catch (cleanupErr) {
                console.error('  Cleanup error:', cleanupErr);
            }
            console.log('  ✓ Server stopped.');
            process.exit(0);
        });

        const timer = setTimeout(() => {
            console.error('  ✗ Forced exit after timeout.');
            process.exit(1);
        }, 5000);
        timer.unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
