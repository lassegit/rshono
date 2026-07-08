/**
 * App Handler
 *
 * Creates the main request handler:
 * 1. Imports user's routes.ts  (→ routes array)
 * 2. Imports user's server.ts  (→ optional Hono sub-app)
 * 3. Builds the complete Hono application
 * 4. Returns the fetch handler
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Hono } from "hono";
import type { RsHonoConfig } from "../config.js";
import type { Route } from "../router.js";
import { buildApp } from "./app.js";

interface HandlerOptions {
  config: RsHonoConfig;
  rootDir: string;
  isDev: boolean;
}

export async function createAppHandler(options: HandlerOptions) {
  const { config, rootDir, isDev } = options;

  // ── Load user routes ──────────────────────────────────────────────────

  const routesPath = join(rootDir, "src", "routes.ts");
  let routes: Route[] = [];

  if (existsSync(routesPath)) {
    try {
      const mod = await import(pathToFileURL(routesPath).href);
      // Support both `export const routes` and `export default routes`
      routes = mod.routes ?? mod.default ?? [];
      if (!Array.isArray(routes)) {
        routes = [];
        console.warn(
          "  ⚠ routes.ts did not export an array. Expected `export const routes = defineRoutes([...])`"
        );
      }
    } catch (err) {
      console.error("  ✗ Failed to load src/routes.ts:");
      console.error(err);
      throw err;
    }
  } else {
    console.log("  • No src/routes.ts found — no pages will be served.");
  }

  // ── Load user server sub-app (optional) ───────────────────────────────

  let subApp: Hono | undefined;
  const serverPath = join(rootDir, "src", "server.ts");

  if (existsSync(serverPath)) {
    try {
      const serverMod = await import(pathToFileURL(serverPath).href);
      subApp = serverMod.default ?? serverMod;
      if (typeof subApp !== "object" || typeof (subApp as any).fetch !== "function") {
        console.warn("  ⚠ server.ts did not default-export a Hono app. Skipping.");
        subApp = undefined;
      }
    } catch (err) {
      console.warn("  ⚠ Failed to load src/server.ts:");
      console.warn(err);
    }
  }

  // ── Assemble ──────────────────────────────────────────────────────────

  let app = buildApp({
    routes,
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
