/**
 * Production Server
 *
 * Serves the app built by `rs-hono build`. SSR runs from the TypeScript
 * source via tsx; the client bundle is served from <outDir>/client.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "../config.js";
import { createAppHandler } from "../server/handler.js";
import { serve } from "../server/node-server.js";

export async function startCommand(portArg?: number) {
  const config = await resolveConfig();
  const rootDir = process.cwd();
  const port = portArg ?? config.dev?.port ?? 3000;
  const outDir = config.outDir ?? "dist";

  console.log("🚀 rs-hono production server");
  console.log("");

  if (!existsSync(join(rootDir, outDir, "client", "chunks", "main.js"))) {
    console.error(`  ✗ No client bundle found in ${outDir}/client.`);
    console.error("    Run `rs-hono build` first.");
    process.exit(1);
  }

  const handler = await createAppHandler({ config, rootDir, isDev: false });

  await serve({ fetch: handler, port });

  console.log(`  ➜  Serving at: http://localhost:${port}`);
  console.log("");
}
