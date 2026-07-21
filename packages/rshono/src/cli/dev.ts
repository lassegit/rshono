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

  await rm(distDir, { recursive: true, force: true });
  await mkdir(join(distDir, 'static'), { recursive: true });

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

  let currentWorker: Worker | null = null;
  let workerPort: number | null = null;
  let workerGate = createGate();
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
        if (worker === currentWorker && code !== 0) {
          console.error(`  ✗ server worker exited with code ${code} — waiting for the next rebuild`);
          currentWorker = null;
          workerGate = createGate();
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
    const location = responseHeaders.get('location');
    if (location) {
      try {
        const loc = new URL(location, target);
        if (loc.host === `127.0.0.1:${workerPort}`) {
          responseHeaders.set('location', `${loc.pathname}${loc.search}${loc.hash}`);
        }
      } catch {}
    }
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
