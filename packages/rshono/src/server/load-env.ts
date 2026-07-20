/**
 * .env loading.
 *
 * loadEnvFile never overwrites keys that are already set, so loading
 * highest-priority first gives:
 *   real environment > .env.local (untracked) > .env
 *
 * Called by the CLI with process.cwd(), and by the server bundle's boot
 * code with the bundle-relative project root — so the bundle finds its
 * .env no matter which directory it is started from.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function loadEnvFiles(rootDir: string): void {
    for (const file of ['.env.local', '.env']) {
        const envPath = join(rootDir, file);
        if (existsSync(envPath)) process.loadEnvFile(envPath);
    }
}
