import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { onShutdown } from '../server/shutdown.js';

interface StartOptions {
  rootDir: string;
  port?: number;
  host?: string;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const { rootDir, port, host } = options;
  const mainPath = join(rootDir, 'dist', 'server', 'main.mjs');
  if (!existsSync(mainPath)) {
    console.error('rshono: no production build found — run `rshono build` first.');
    process.exit(1);
  }

  const env = { ...process.env };
  if (port !== undefined) env.PORT = String(port);
  if (host !== undefined) env.HOST = host;

  const child = spawn(process.execPath, ['--enable-source-maps', mainPath], {
    stdio: 'inherit',
    env,
  });

  onShutdown((signal) => child.kill(signal));
  child.on('exit', (code, signal) => {
    process.exit(signal ? 1 : (code ?? 1));
  });
}
