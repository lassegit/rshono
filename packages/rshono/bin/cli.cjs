#!/usr/bin/env node
/**
 * rshono CLI bootstrap.
 *
 * Runs the TypeScript CLI directly via tsx — no pre-build step. tsx is
 * resolved from rshono's own dependencies (never from PATH), so this
 * works under pnpm's isolated node_modules and on Windows.
 *
 * Unlike rs-hono there is no `tsx watch`: in dev the app runs as a
 * bundled worker that the CLI restarts on every server rebuild, so the
 * CLI process itself never needs restarting.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

let tsxCli;
try {
  tsxCli = require.resolve('tsx/cli');
} catch {
  console.error("rshono: could not resolve its 'tsx' dependency. Try reinstalling rshono.");
  process.exit(1);
}

const cliEntry = path.join(__dirname, '..', 'src', 'cli', 'index.ts');
const userArgs = process.argv.slice(2);

// `build` prerenders through the real server bundle and `start` runs it —
// both must see production NODE_ENV before anything loads React.
const env = { ...process.env };
if ((userArgs[0] === 'start' || userArgs[0] === 'build') && !env.NODE_ENV) {
  env.NODE_ENV = 'production';
}

const child = spawn(process.execPath, [tsxCli, cliEntry, ...userArgs], {
  stdio: 'inherit',
  env,
});

// Forward termination signals so supervisors (docker stop, systemd, kill)
// reach the server and trigger its graceful shutdown. Ctrl+C already goes
// to the whole process group; forwarding twice is harmless.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (err) => {
  console.error('rshono: failed to start:', err.message);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
