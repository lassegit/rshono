/**
 * Node HTTP ↔ Web fetch adapter.
 *
 * One small, shared bridge between Node's http.createServer and a Hono
 * fetch handler — used by both `rs-hono dev` and `rs-hono start`.
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

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

  const server = createServer((req, res) => {
    handleRequest(fetch, req, res).catch((err) => {
      console.error("[rs-hono] Request error:", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
      }
      if (!res.writableEnded) res.end("Internal Server Error");
    });
  });

  // A few retries so a dev-server restart can grab the port the previous
  // process is still releasing.
  const maxAttempts = graceful ? 1 : 10;
  await new Promise<void>((resolve, reject) => {
    let attempt = 0;
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && ++attempt < maxAttempts) {
        setTimeout(() => server.listen(port, hostname), 200);
        return;
      }
      if (err.code === "EADDRINUSE") {
        console.error(`  ✗ Port ${port} is already in use.`);
        console.error(`    Try: --port ${port + 1}`);
        process.exit(1);
      }
      reject(err);
    });
    server.listen(port, hostname, resolve);
  });

  installShutdown(server, onShutdown, graceful);
  return server;
}

async function handleRequest(
  fetch: ServeOptions["fetch"],
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // ── Node request → Web Request ──────────────────────────────────────
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }

  let body: BodyInit | null = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    body = Buffer.concat(chunks);
  }

  const webRes = await fetch(new Request(url, { method: req.method, headers, body }));

  // ── Web Response → Node response ────────────────────────────────────
  res.statusCode = webRes.status;
  for (const [key, value] of webRes.headers) {
    // set-cookie must not be joined — handled below via getSetCookie().
    if (key !== "set-cookie") res.setHeader(key, value);
  }
  const cookies = webRes.headers.getSetCookie();
  if (cookies.length > 0) res.setHeader("set-cookie", cookies);

  if (!webRes.body) {
    res.end();
    return;
  }

  const reader = webRes.body.getReader();

  // Stop rendering/streaming when the client disconnects mid-response.
  res.on("close", () => {
    if (!res.writableFinished) reader.cancel().catch(() => {});
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) {
        await new Promise<void>((resolve) => res.once("drain", resolve));
      }
    }
    res.end();
  } catch (err) {
    console.error("[rs-hono] Response stream error:", err);
    if (!res.writableEnded) res.end();
  }
}

function installShutdown(
  server: Server,
  onShutdown: (() => void | Promise<void>) | undefined,
  graceful: boolean
): void {
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
      if (err) console.error("  Server close error:", err);
      try {
        await onShutdown?.();
      } catch (cleanupErr) {
        console.error("  Cleanup error:", cleanupErr);
      }
      console.log("  ✓ Server stopped.");
      process.exit(0);
    });

    const timer = setTimeout(() => {
      console.error("  ✗ Forced exit after timeout.");
      process.exit(1);
    }, 5000);
    timer.unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
