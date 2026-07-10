/**
 * Dev Server
 *
 * 1. Starts the Rspack client-bundle watcher (hydration chunks)
 * 2. Imports routes.ts / server.ts and builds the Hono app (SSR)
 * 3. Serves on localhost
 *
 * File watching for the SERVER side is handled by the bin launcher,
 * which runs this command under `tsx watch` — editing any imported
 * file restarts the whole process.
 */
import { rspack } from "@rspack/core";
import { setAssets } from "../assets.js";
import { assetManifestFromStats } from "../builder/assets-manifest.js";
import { createAppHandler } from "../server/handler.js";
import { createClientRspackConfig } from "../builder/rspack-config.js";
import { serve } from "../server/node-server.js";
import { resolveConfig } from "../config.js";

export async function devCommand(portArg?: number) {
  const config = await resolveConfig();
  const rootDir = process.cwd();
  const port = portArg ?? config.dev?.port ?? 3000;
  const outDir = config.outDir ?? "dist";

  console.log("⚡ rs-hono dev server");
  console.log("");

  // ── Client bundle watcher ──────────────────────────────────────────
  const compiler = rspack(createClientRspackConfig({ rootDir, outDir, isDev: true }));
  const watching = compiler.watch({}, (err, stats) => {
    if (err) {
      console.error("  ✗ Client bundler error:", err);
      return;
    }
    if (stats?.hasErrors()) {
      console.error(stats.toString({ preset: "errors-warnings", colors: true }));
      return;
    }
    // Requests served before the first compile finishes render without
    // CSS links — refresh once the bundle is ready.
    if (stats) setAssets(assetManifestFromStats(stats));
    console.log("  ✓ Client bundle ready");
  });

  // ── SSR handler ────────────────────────────────────────────────────
  let handler;
  try {
    handler = await createAppHandler({ config, rootDir, isDev: true });
  } catch (err) {
    console.error("  ✗ Failed to initialise server:");
    console.error(err);
    process.exit(1);
  }

  // Dev binds to localhost only — half-built apps with verbose error
  // pages should not be reachable from the local network.
  await serve({
    fetch: handler,
    port,
    hostname: "127.0.0.1",
    graceful: false, // die fast on restart — tsx watch needs the port back
    onShutdown: () => new Promise<void>((resolve) => watching.close(() => resolve())),
  });

  console.log(`  ➜  Local: http://localhost:${port}`);
  console.log("");
}
