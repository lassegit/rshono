import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function loadEnvFiles(rootDir: string): void {
  for (const file of ['.env.local', '.env']) {
    const envPath = join(rootDir, file);
    if (existsSync(envPath)) process.loadEnvFile(envPath);
  }
}
