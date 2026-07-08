import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { buildCommand } from './build.js';
import { devCommand } from './dev.js';
import { startCommand } from './start.js';

const { version } = createRequire(import.meta.url)('../../package.json');

const HELP = `rs-hono — Ultra-minimalist SSR framework (Hono + Rspack)

Usage: rs-hono <command> [options]

Commands:
  dev     Start the development server
  build   Build for production
  start   Start the production server

Options:
  -p, --port <number>  Port to listen on (default: PORT env, config dev.port, or 3000)
  -h, --help           Show this help
  -v, --version        Show the version
`;

function fail(message: string): never {
    console.error(`✗ ${message}`);
    console.error(`  Run \`rs-hono --help\` for usage.`);
    process.exit(1);
}

function parsePort(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const port = Number(value);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        fail(`Invalid port: "${value}" (expected 0–65535)`);
    }
    return port;
}

let args;
try {
    args = parseArgs({
        args: process.argv.slice(2),
        allowPositionals: true,
        options: {
            port: { type: 'string', short: 'p' },
            help: { type: 'boolean', short: 'h' },
            version: { type: 'boolean', short: 'v' },
        },
    });
} catch (err) {
    fail(err instanceof Error ? err.message : String(err));
}

const { values, positionals } = args;
const command = positionals[0];

if (values.version) {
    console.log(version);
    process.exit(0);
}
if (values.help || command === undefined) {
    console.log(HELP);
    process.exit(command === undefined && !values.help ? 1 : 0);
}

const port = parsePort(values.port);

switch (command) {
    case 'dev':
        await devCommand(port);
        break;
    case 'build':
        await buildCommand();
        break;
    case 'start':
        await startCommand(port);
        break;
    default:
        fail(`Unknown command: "${command}"`);
}
