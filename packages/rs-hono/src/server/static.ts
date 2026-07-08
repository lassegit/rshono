/**
 * Static File Serving Middleware
 *
 * Mounted under the reserved /_static prefix. Serves from a list of
 * roots (first hit wins):
 *   dev:  [public/, <outDir>/client]   — user assets + watch-built bundle
 *   prod: [<outDir>/client]            — build copies public/ in here
 */
import { Hono } from "hono";
import { readFileSync, statSync } from "node:fs";
import { join, extname, sep } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function getMimeType(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** Content-hashed filenames (e.g. chunk.abc123de.js) may cache forever. */
const CONTENT_HASHED = /\.[0-9a-f]{8,}\./;

interface StaticOptions {
  roots: string[];
  isDev: boolean;
}

export function createStaticMiddleware(options: StaticOptions): Hono {
  const { roots, isDev } = options;
  const app = new Hono();

  app.get("/*", (c) => {
    let pathname = c.req.path.replace(/^\/_static/, "");
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      return c.text("Bad Request", 400);
    }
    if (pathname.includes("\0")) {
      return c.text("Bad Request", 400);
    }

    for (const root of roots) {
      const fullPath = join(root, pathname);
      // Traversal guard. The trailing separator matters: without it,
      // "/app/public-secrets" would pass a startsWith("/app/public") check.
      if (fullPath !== root && !fullPath.startsWith(root + sep)) {
        return c.text("Forbidden", 403);
      }

      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue; // not in this root — try the next one
      }
      if (!stat.isFile()) continue;

      const cacheControl = isDev
        ? "no-cache"
        : CONTENT_HASHED.test(pathname)
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300";

      try {
        return new Response(readFileSync(fullPath), {
          status: 200,
          headers: {
            "Content-Type": getMimeType(fullPath),
            "Cache-Control": cacheControl,
          },
        });
      } catch {
        return c.text("Internal Server Error", 500);
      }
    }

    return c.text("Not Found", 404);
  });

  return app;
}
