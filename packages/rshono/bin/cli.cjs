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

const env = { ...process.env };
if ((userArgs[0] === 'start' || userArgs[0] === 'build') && !env.NODE_ENV) {
  env.NODE_ENV = 'production';
}

const child = spawn(process.execPath, [tsxCli, cliEntry, ...userArgs], {
  stdio: 'inherit',
  env,
});

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
