import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { loadEnvFiles } from '../server/load-env.js';
import { buildCommand } from './build.js';
import { devCommand } from './dev.js';
import { startCommand } from './start.js';

const HELP = `rshono — Hono + Rspack + React Server Components

Usage:
  rshono dev     [--port 3000]   start the dev server
  rshono build                   build for production (client + server + SSG)
  rshono start   [--port 3000]   run the production build

Options:
  -p, --port <n>   port to listen on (default: PORT env or 3000)
  -h, --help       show this help
  -v, --version    print the version
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      port: { type: 'string', short: 'p' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    allowPositionals: true,
  });

  if (values.version) {
    const require = createRequire(import.meta.url);
    console.log(require('rshono/package.json').version);
    return;
  }

  const command = positionals[0];
  if (values.help || !command) {
    console.log(HELP);
    return;
  }

  const rootDir = process.cwd();
  loadEnvFiles(rootDir);

  const port = values.port ? Number(values.port) : undefined;
  if (values.port && Number.isNaN(port)) {
    console.error(`rshono: invalid --port "${values.port}"`);
    process.exit(1);
  }

  switch (command) {
    case 'dev':
      return devCommand({ rootDir, port });
    case 'build':
      return buildCommand({ rootDir });
    case 'start':
      return startCommand({ rootDir, port });
    default:
      console.error(`rshono: unknown command "${command}"\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
