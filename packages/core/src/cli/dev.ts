import { serve } from '@hono/node-server';
import { rspack, type Stats } from '@rspack/core';
import { Hono } from 'hono';
import { proxy } from 'hono/proxy';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createConfigs } from '../builder/rspack-config.js';
import type { RshonoConfig } from '../config.js';
import { NODE_PRESET } from '../deploy/presets.js';
import type { DevMessage } from '../runtime/dev-protocol.js';
import { SERVER_DEFAULTS } from '../server/server-config.js';
import { createStaticAssetsApp } from '../server/static.js';

const WORKER_READY_TIMEOUT_MS = 15_000;

/** An error as the dev server shows it in the browser: the stack where there is one, since this is dev. */
function describe(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

interface DevOptions {
  rootDir: string;
  port?: number;
  config: RshonoConfig;
}

export async function devCommand(options: DevOptions): Promise<void> {
  const { rootDir, config } = options;
  const port = options.port ?? SERVER_DEFAULTS.port;
  const distDir = join(rootDir, 'dist');

  await rm(distDir, { recursive: true, force: true });
  await mkdir(join(distDir, 'static'), { recursive: true });

  const encoder = new TextEncoder();
  const sseClients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  let clientHash: string | undefined;

  const sseChunk = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

  /**
   * Writes one already-encoded SSE frame to every open client, dropping the ones that have gone away.
   *
   * A browser that navigated or closed leaves a controller behind whose `enqueue` throws, and `cancel`
   * is not always reached first — so a failed write is what retires a client, wherever it happens.
   */
  function sendToAll(chunk: Uint8Array): void {
    for (const controller of sseClients) {
      try {
        controller.enqueue(chunk);
      } catch {
        sseClients.delete(controller);
      }
    }
  }

  function broadcast(message: DevMessage): void {
    sendToAll(sseChunk(message));
  }

  let serverComponentsChanged = false;
  const [clientConfig, serverConfig] = createConfigs({
    rootDir,
    isDev: true,
    config,
    // Always Node, whatever `deploy` says: the dev server runs the bundle in a worker thread of this
    // process and fronts it on one port. `deploy` is a property of `build` output, not of developing.
    preset: NODE_PRESET,
    onServerComponentChanges: () => {
      serverComponentsChanged = true;
    },
  });
  const compiler = rspack([clientConfig, serverConfig]);
  const [clientCompiler, serverCompiler] = compiler.compilers;

  let currentWorker: Worker | null = null;
  let workerPort: number | null = null;
  let workerGate = createGate();
  let restartChain: Promise<void> = Promise.resolve();

  function createGate() {
    const { promise, resolve } = Promise.withResolvers<{ error?: string }>();
    return { promise, open: resolve };
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

      let ready = false;
      worker.once('message', (message: { type?: string; port?: number }) => {
        if (message?.type === 'ready' && typeof message.port === 'number') {
          ready = true;
          clearTimeout(timeout);
          resolve({ worker, port: message.port });
        }
      });
      // `on`, not `once`. An error *after* the worker is ready has no pending promise left to reject,
      // so it has to be reported here or nowhere — the `exit` handler below only ever learns the code.
      // And a consumed `once` would leave a later 'error' with no listener at all, which Node turns
      // into an uncaught exception that takes the dev server down with the worker.
      worker.on('error', (error) => {
        if (ready) {
          console.error('  ✗ server worker crashed:', error);
          return;
        }
        clearTimeout(timeout);
        reject(error);
      });
      worker.on('exit', (code) => {
        if (worker === currentWorker && code !== 0) {
          console.error(`  ✗ server worker exited with code ${code} — waiting for the next rebuild`);
          currentWorker = null;
          // Opened with the reason rather than left closed: a request arriving before the next rebuild
          // parks on this gate, and an unopened one means the browser hangs indefinitely with only the
          // terminal saying why. `hooks.invalid` puts a fresh, closed gate here the moment a file
          // changes, so the next build still holds requests until the worker is back.
          workerGate = createGate();
          workerGate.open({ error: `The server worker exited with code ${code}. See the terminal for the error it crashed with.` });
        }
      });
    });
  }

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
        gate.open({ error: describe(error) });
      }
    });
    // `restartChain` is the queue every later rebuild is appended to, so no link in it may be left
    // rejected: `.then` on a rejected promise short-circuits, and from that point no worker is ever
    // spawned again and no gate is ever opened — a dev server that answers nothing and explains
    // nothing. The `try` above covers the restart itself; this covers the rest of the callback.
    restartChain = restartChain.catch((error) => {
      console.error('  ✗ dev server restart failed:', error);
      gate.open({ error: describe(error) });
    });
    await restartChain;
  });

  clientCompiler.hooks.done.tap('rshono/hmr', (stats: Stats) => {
    if (stats.hasErrors()) {
      console.error(stats.toString({ preset: 'errors-warnings', colors: true }));
      return;
    }
    clientHash = stats.hash ?? undefined;
    if (clientHash) broadcast({ type: 'client-built', hash: clientHash });
  });

  let firstBuild = true;
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

  const front = new Hono();

  front.route('/_static', createStaticAssetsApp({ root: join(distDir, 'static'), isDev: true }));

  front.get('/_rshono/hmr', (c) => {
    let ctrl: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        ctrl = controller;
        sseClients.add(controller);
        controller.enqueue(encoder.encode('retry: 500\n\n'));
        controller.enqueue(sseChunk({ type: 'hello', hash: clientHash } satisfies DevMessage));
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

  // An SSE comment, not a message: it keeps an idle connection off a proxy's timeout without the
  // client having to know about a frame type that means nothing.
  const ping = encoder.encode(': ping\n\n');
  setInterval(() => sendToAll(ping), 15_000).unref();

  front.all('*', async (c) => {
    const { error } = await workerGate.promise;
    if (error || workerPort === null) {
      return c.text(`Build failed:\n\n${error ?? 'server not running'}`, 500);
    }

    const incoming = new URL(c.req.url);
    const target = `http://127.0.0.1:${workerPort}${incoming.pathname}${incoming.search}`;

    // Hono's proxy helper, rather than a hand-rolled `fetch`: it carries the method, the streamed body
    // (with the `duplex` Node requires) and — new here — the client's abort signal, so a browser that
    // goes away takes the worker's render with it. On the way back it strips the hop-by-hop headers,
    // framing that belongs to one connection and must not be forwarded onto another, and drops
    // `content-length` alongside a `content-encoding` rather than unconditionally, so a response whose
    // length is still accurate keeps it. `headers` replaces the set wholesale, so the request's own are
    // spread back in first.
    const response = await proxy(target, {
      raw: c.req.raw,
      // The worker's redirects are the app's answer to this request, not something to follow here —
      // they have to reach the browser, with the internal address rewritten off them below.
      redirect: 'manual',
      headers: {
        ...c.req.header(),
        // This front-end *is* the proxy the app sits behind, and `trustProxy` is forced on in dev for
        // exactly that reason: without these the app resolves every URL against the worker's random
        // 127.0.0.1 port instead of the address the browser actually used.
        'x-forwarded-host': incoming.host,
        'x-forwarded-proto': incoming.protocol.replace(':', ''),
      },
    });

    // `proxy` hands back a response whose headers are still mutable, so the one rewrite that is ours
    // to make happens in place: a redirect to the worker's own address has to become a relative one,
    // or the browser leaves the dev server for a port only this process knows about.
    const location = response.headers.get('location');
    const loc = location ? URL.parse(location, target) : null;
    if (loc && loc.host === `127.0.0.1:${workerPort}`) {
      response.headers.set('location', `${loc.pathname}${loc.search}${loc.hash}`);
    }
    return response;
  });

  serve({ fetch: front.fetch, port, hostname: '127.0.0.1' }, (info) => {
    console.log(`  ➜ rshono dev server: http://localhost:${info.port}`);
  });
}
