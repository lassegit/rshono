/**
 * App Handler
 *
 * Creates the main request handler:
 * 1. Imports user's routes.ts  (→ routes array)
 * 2. Imports user's server.ts  (→ optional Hono sub-app)
 * 3. Builds the complete Hono application
 * 4. Returns the fetch handler
 */
import { Hono } from "hono";
import type { RsHonoConfig } from "../config.js";
import { buildApp } from "./app.js";
import { loadRoutes, loadServerApp } from "./load.js";

interface HandlerOptions {
  config: RsHonoConfig;
  rootDir: string;
  isDev: boolean;
}

export async function createAppHandler(options: HandlerOptions) {
  const { config, rootDir, isDev } = options;

  let routes;
  try {
    routes = await loadRoutes(rootDir);
  } catch (err) {
    console.error("  ✗ Failed to load src/routes.ts:");
    console.error(err);
    throw err;
  }
  if (routes === null) {
    console.log("  • No src/routes.ts found — no pages will be served.");
  }

  const subApp = await loadServerApp(rootDir);

  let app = buildApp({
    routes: routes ?? [],
    subApp,
    rootDir,
    publicDir: config.publicDir ?? "public",
    outDir: config.outDir ?? "dist",
    isDev,
  });

  // Global middleware from rs-hono.config.ts. Hono runs middleware only
  // for handlers registered AFTER it, so wrap the app instead of appending.
  if (config.server?.middleware) {
    const outer = new Hono();
    outer.use("*", config.server.middleware);
    outer.route("/", app);
    app = outer;
  }

  // Startup hook from rs-hono.config.ts
  if (config.server?.onStart) {
    await config.server.onStart();
  }

  return app.fetch;
}
