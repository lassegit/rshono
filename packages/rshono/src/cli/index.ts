import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { loadConfig } from '../server/load-config.js';
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
  -p, --port <n>      port to listen on (default: PORT env or rshono.config.ts or 3000)
  -c, --config <path> path to a config file (default: rshono.config.{ts,js,mjs})
  -h, --help          show this help
  -v, --version       print the version
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      port: { type: 'string', short: 'p' },
      config: { type: 'string', short: 'c' },
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
  const config = await loadConfig(rootDir, values.config);

  const flagPort = values.port ? Number(values.port) : undefined;
  if (values.port && Number.isNaN(flagPort)) {
    console.error(`rshono: invalid --port "${values.port}"`);
    process.exit(1);
  }
  // Precedence: --port flag > PORT env > rshono.config.ts > the command's built-in default.
  const envPort = process.env.PORT ? Number(process.env.PORT) : undefined;
  const port = flagPort ?? envPort ?? config.port;
  const host = process.env.HOST ?? config.host;

  switch (command) {
    case 'dev':
      return devCommand({ rootDir, port, config });
    case 'build':
      return buildCommand({ rootDir, config });
    case 'start':
      return startCommand({ rootDir, port, host });
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
