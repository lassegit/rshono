#!/usr/bin/env node
/**
 * rs-hono CLI bootstrap.
 *
 * Runs the TypeScript CLI directly via tsx — no pre-build step. tsx is
 * resolved from rs-hono's own dependencies (never from PATH), so this
 * works under pnpm's isolated node_modules and on Windows.
 *
 * `rs-hono dev` runs under `tsx watch`: editing any file the server
 * imports (routes, loaders, pages) restarts the dev server.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

let tsxCli;
try {
  tsxCli = require.resolve("tsx/cli");
} catch {
  console.error("rs-hono: could not resolve its 'tsx' dependency. Try reinstalling rs-hono.");
  process.exit(1);
}

const cliEntry = path.join(__dirname, "..", "src", "cli", "index.ts");
const userArgs = process.argv.slice(2);
const watch = userArgs[0] === "dev" ? ["watch", "--clear-screen=false"] : [];

const result = spawnSync(
  process.execPath,
  [tsxCli, ...watch, cliEntry, ...userArgs],
  { stdio: "inherit" }
);

if (result.error) {
  console.error("rs-hono: failed to start:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
