import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const exampleDir = fileURLToPath(new URL('../../examples/rs-basic', import.meta.url));
const cli = fileURLToPath(new URL('./bin/rshono.mjs', import.meta.url));
const PORT = 3210;

// These run against a real production build in a real browser, because that is the only place the
// client runtime — soft navigation, prefetching, scroll restoration, the fatal overlay — actually
// executes. The node:test suite can only check that the code was shipped.
export default defineConfig({
  testDir: './test/browser',
  // One app, one server, shared state (the demo's user list is mutable): parallelism would make
  // these flaky for no gain — there are only a handful of them.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: `node "${cli}" build && node "${cli}" start`,
    cwd: exampleDir,
    url: `http://127.0.0.1:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
