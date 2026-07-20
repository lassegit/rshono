/**
 * Production server: run the self-contained bundle in a child node
 * process. The CLI's only jobs are the preflight check, env (.env was
 * loaded by cli/index.ts before this — the child inherits it), and
 * signal forwarding. `node dist/server/main.mjs` works too, minus the
 * .env-before-user-code guarantee.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface StartOptions {
    rootDir: string;
    port?: number;
}

export async function startCommand(options: StartOptions): Promise<void> {
    const { rootDir, port } = options;
    const mainPath = join(rootDir, 'dist', 'server', 'main.mjs');
    if (!existsSync(mainPath)) {
        console.error('rshono: no production build found — run `rshono build` first.');
        process.exit(1);
    }

    const env = { ...process.env };
    if (port !== undefined) env.PORT = String(port);

    const child = spawn(process.execPath, ['--enable-source-maps', mainPath], {
        stdio: 'inherit',
        env,
    });

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(signal, () => child.kill(signal));
    }
    child.on('exit', (code, signal) => {
        process.exit(signal ? 1 : (code ?? 1));
    });
}
