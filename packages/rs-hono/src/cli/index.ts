import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { registerCssHooks } from '../builder/css-hooks.mjs';
import { registerEnvHooks } from '../builder/env-hooks.mjs';
import { publicEnv } from '../builder/public-env.js';
import { loadEnvFiles } from '../server/load-env.js';
import { buildCommand } from './build.js';
import { devCommand } from './dev.js';
import { previewCommand } from './preview.js';
import { startCommand } from './start.js';

// Before any user code loads: layouts/pages import CSS, which the server
// (running raw source via tsx) cannot parse without these hooks.
registerCssHooks();

// .env files — before config/routes/loaders (and publicEnv below) run.
loadEnvFiles(process.cwd());

const { version } = createRequire(import.meta.url)('../../package.json');

const HELP = `rs-hono — Ultra-minimalist SSR framework (Hono + Rspack)

Usage: rs-hono <command> [options]

Commands:
  dev      Start the development server
  build    Build for production
  start    Start the production server (tsx runtime)
  preview  Serve an edge build locally (site/ + app.mjs, like a platform would)

Options:
  -p, --port <number>       Port to listen on (default: PORT env, config dev.port, or 3000)
  --target <node|edge>      build: also emit a server bundle to <outDir>/server —
                            node: self-contained \`node dist/server/index.mjs\` (no tsx)
                            edge: fetch-handler bundle + <outDir>/site for the platform CDN
  -h, --help                Show this help
  -v, --version             Show the version
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
            target: { type: 'string' },
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

const target = values.target;
if (target !== undefined) {
    if (command !== 'build') fail('--target only applies to `rs-hono build`.');
    if (target !== 'node' && target !== 'edge') fail(`Invalid --target: "${target}" (expected "node" or "edge")`);
}

// Server-side half of the public-env contract: shared modules (under src/,
// not server-only) see the same PUBLIC_-filtered env object the client
// bundle inlines — a stray `process.env.SECRET` in a component renders
// empty instead of streaming the secret into SSR HTML. Must be registered
// before the commands import routes/pages.
registerEnvHooks({ rootDir: process.cwd(), publicEnv: publicEnv(command === 'dev') });

switch (command) {
    case 'dev':
        await devCommand(port);
        break;
    case 'build':
        await buildCommand(target);
        break;
    case 'start':
        await startCommand(port);
        break;
    case 'preview':
        await previewCommand(port);
        break;
    default:
        fail(`Unknown command: "${command}"`);
}
