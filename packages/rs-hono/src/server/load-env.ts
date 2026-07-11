/**
 * .env loading — a pure side-effect module.
 *
 * Imported by the CLI (cli/index.ts) and generated FIRST in the node
 * server-bundle entry, so it evaluates before any user module can read
 * process.env. loadEnvFile never overwrites keys that are already set,
 * so loading highest-priority first gives:
 *   real environment > .env.local (untracked) > .env
 *
 * Not part of edge bundles: no filesystem there — the platform's own
 * env/bindings mechanism replaces .env files.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

for (const file of ['.env.local', '.env']) {
    const envPath = join(process.cwd(), file);
    if (existsSync(envPath)) process.loadEnvFile(envPath);
}
