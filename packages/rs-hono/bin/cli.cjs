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
const { spawn } = require("node:child_process");
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
// .env files aren't imported, so tsx wouldn't watch them — include them
// explicitly: editing one restarts the server with fresh values.
const watch = userArgs[0] === "dev" ? ["watch", "--clear-screen=false", "--include=.env*"] : [];

const child = spawn(process.execPath, [tsxCli, ...watch, cliEntry, ...userArgs], {
  stdio: "inherit",
});

// Forward termination signals so supervisors (docker stop, systemd, kill)
// reach the server and trigger its graceful shutdown. Ctrl+C already goes
// to the whole process group; forwarding twice is harmless.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (err) => {
  console.error("rs-hono: failed to start:", err.message);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : code ?? 1);
});
