/**
 * Dev server — three cooperating pieces in one process, one visible port:
 *
 * 1. Rspack MultiCompiler in watch mode (client + server bundles,
 *    written to disk).
 * 2. A worker manager: every successful server build terminates the old
 *    worker and boots dist/server/main.mjs fresh in a worker_thread on
 *    an ephemeral port. The readiness gate is REPLACED the moment a
 *    rebuild starts, so proxied requests wait for the new worker
 *    instead of hitting a half-dead one — no connection-refused gap.
 * 3. A front Hono server on the user's port:
 *      /_static/*      static files from dist/static + public/
 *                      (includes HMR hot-update chunks)
 *      /_rshono/hmr  SSE: 'client-built' after client rebuilds,
 *                      'rsc-update' after server-component rebuilds,
 *                      'hello' (with the current hash) on connect
 *      everything else proxied to the worker.
 *
 * Known dev-only limitation: the proxy speaks plain HTTP — WebSocket
 * upgrades from a custom sub-app don't cross it (they work in prod,
 * where the bundle owns the socket).
 */
import { serve } from '@hono/node-server';
import { rspack, type Stats } from '@rspack/core';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createConfigs } from '../builder/rspack-config.js';
import { createStaticMiddleware } from '../server/static.js';

const WORKER_READY_TIMEOUT_MS = 15_000;

interface DevOptions {
  rootDir: string;
  port?: number;
}

export async function devCommand(options: DevOptions): Promise<void> {
  const { rootDir } = options;
  const port = options.port ?? Number(process.env.PORT || 3000);
  const distDir = join(rootDir, 'dist');

  // Fresh slate once per session; during the session stale files are
  // kept (output.clean is off in dev) so in-flight hot-update fetches
  // never 404 mid-rebuild. Pre-create dist/static so serveStatic
  // doesn't warn about a missing root before the first build lands.
  await rm(distDir, { recursive: true, force: true });
  await mkdir(join(distDir, 'static'), { recursive: true });

  // ─── SSE hub ──────────────────────────────────────────────────────

  const encoder = new TextEncoder();
  const sseClients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  let clientHash: string | undefined;

  const sseChunk = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
  function broadcast(message: unknown): void {
    const chunk = sseChunk(message);
    for (const controller of sseClients) {
      try {
        controller.enqueue(chunk);
      } catch {
        sseClients.delete(controller);
      }
    }
  }

  // ─── Compiler ─────────────────────────────────────────────────────

  let serverComponentsChanged = false;
  const [clientConfig, serverConfig] = createConfigs({
    rootDir,
    isDev: true,
    onServerComponentChanges: () => {
      serverComponentsChanged = true;
    },
  });
  const compiler = rspack([clientConfig, serverConfig]);
  const [clientCompiler, serverCompiler] = compiler.compilers;

  // ─── Worker manager ───────────────────────────────────────────────

  let currentWorker: Worker | null = null;
  let workerPort: number | null = null;
  /** Replaced (re-pended) whenever a server rebuild starts. */
  let workerGate = createGate();
  /** Serializes restarts so overlapping builds can't race. */
  let restartChain: Promise<void> = Promise.resolve();

  function createGate() {
    let open!: (result: { error?: string }) => void;
    const promise = new Promise<{ error?: string }>((resolve) => {
      open = resolve;
    });
    return { promise, open };
  }

  function spawnWorker(): Promise<{ worker: Worker; port: number }> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(join(distDir, 'server', 'main.mjs'), {
        workerData: { port: 0, hostname: '127.0.0.1' },
        execArgv: ['--enable-source-maps'],
        env: process.env as Record<string, string>,
      });
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error(`server worker did not become ready within ${WORKER_READY_TIMEOUT_MS / 1000}s`));
      }, WORKER_READY_TIMEOUT_MS);

      worker.once('message', (message: { type?: string; port?: number }) => {
        if (message?.type === 'ready' && typeof message.port === 'number') {
          clearTimeout(timeout);
          resolve({ worker, port: message.port });
        }
      });
      worker.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      worker.on('exit', (code) => {
        // Crash after ready (top-level throw on a later request…):
        // surface it and let the next rebuild recover.
        if (worker === currentWorker && code !== 0) {
          console.error(`  ✗ server worker exited with code ${code} — waiting for the next rebuild`);
          currentWorker = null;
          workerGate = createGate();
        }
      });
    });
  }

  // A rebuild has started: close the gate so requests queue up.
  serverCompiler.hooks.invalid.tap('rshono/gate', () => {
    workerGate = createGate();
  });

  serverCompiler.hooks.done.tapPromise('rshono/worker', async (stats: Stats) => {
    const gate = workerGate;
    restartChain = restartChain.then(async () => {
      if (stats.hasErrors()) {
        console.error(stats.toString({ preset: 'errors-warnings', colors: true }));
        gate.open({ error: stats.toString({ preset: 'errors-only', colors: false }) });
        return;
      }
      try {
        if (currentWorker) {
          const old = currentWorker;
          currentWorker = null;
          await old.terminate();
        }
        const { worker, port: newPort } = await spawnWorker();
        currentWorker = worker;
        workerPort = newPort;
        gate.open({});
        if (serverComponentsChanged) {
          serverComponentsChanged = false;
          broadcast({ type: 'rsc-update' });
        }
      } catch (error) {
        console.error('  ✗ failed to start server worker:', error);
        gate.open({ error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
      }
    });
    await restartChain;
  });

  clientCompiler.hooks.done.tap('rshono/hmr', (stats: Stats) => {
    if (stats.hasErrors()) {
      console.error(stats.toString({ preset: 'errors-warnings', colors: true }));
      return;
    }
    clientHash = stats.hash ?? undefined;
    broadcast({ type: 'client-built', hash: clientHash });
  });

  let firstBuild = true;
  // One watchOptions object PER compiler — never a shared one: the RSC
  // ClientPlugin's coordinator mutates the client's watchOptions
  // (ignored: () => true; the server watcher proxies invalidation to
  // the client), and with a shared object that mutation would blind
  // the server watcher too, silently disabling all rebuilds.
  compiler.watch([{}, {}] as never, (err, multiStats) => {
    if (err) {
      console.error('  ✗ build failed:', err);
      return;
    }
    if (multiStats && !multiStats.hasErrors()) {
      const seconds = Math.max(...multiStats.stats.map((s) => (s.endTime ?? 0) - (s.startTime ?? 0))) / 1000;
      console.log(`  ${firstBuild ? '✓ built' : '✓ rebuilt'} in ${seconds.toFixed(1)}s`);
      firstBuild = false;
    }
  });

  // ─── Front server ─────────────────────────────────────────────────

  const front = new Hono();

  const publicDir = join(rootDir, 'public');
  front.route(
    '/_static',
    createStaticMiddleware({
      roots: [join(distDir, 'static'), ...(existsSync(publicDir) ? [publicDir] : [])],
      isDev: true,
    }),
  );

  front.get('/_rshono/hmr', (c) => {
    let ctrl: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        ctrl = controller;
        sseClients.add(controller);
        controller.enqueue(encoder.encode('retry: 500\n\n'));
        controller.enqueue(sseChunk({ type: 'hello', hash: clientHash }));
      },
      cancel() {
        sseClients.delete(ctrl);
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  });

  // Detect dead SSE connections (closed tabs) so the set doesn't grow.
  setInterval(() => {
    for (const controller of sseClients) {
      try {
        controller.enqueue(encoder.encode(': ping\n\n'));
      } catch {
        sseClients.delete(controller);
      }
    }
  }, 15_000).unref();

  front.all('*', async (c) => {
    const { error } = await workerGate.promise;
    if (error || workerPort === null) {
      return c.text(`Build failed:\n\n${error ?? 'server not running'}`, 500);
    }

    const incoming = new URL(c.req.url);
    const target = `http://127.0.0.1:${workerPort}${incoming.pathname}${incoming.search}`;

    const headers = new Headers(c.req.raw.headers);
    // The worker never compresses, and a forwarded accept-encoding
    // would make undici transparently decompress while keeping the
    // content-encoding header — a corrupted response for the browser.
    headers.delete('accept-encoding');
    headers.set('x-forwarded-host', incoming.host);
    headers.set('x-forwarded-proto', incoming.protocol.replace(':', ''));

    const hasBody = c.req.method !== 'GET' && c.req.method !== 'HEAD';
    const response = await fetch(target, {
      method: c.req.method,
      headers,
      body: hasBody ? c.req.raw.body : undefined,
      redirect: 'manual',
      // @ts-expect-error — Node fetch requires duplex for streamed bodies
      duplex: hasBody ? 'half' : undefined,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  });

  serve({ fetch: front.fetch, port, hostname: '127.0.0.1' }, (info) => {
    console.log(`  ➜ rshono dev server: http://localhost:${info.port}`);
  });
}
