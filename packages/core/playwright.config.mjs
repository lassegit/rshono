import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const testbedDir = fileURLToPath(new URL('../../apps/testbed', import.meta.url));
const cli = fileURLToPath(new URL('./bin/rshono.mjs', import.meta.url));
const PORT = 3210;

// These run against a real production build in a real browser, because that is the only place the
// client runtime — soft navigation, server actions, anchor and scroll behaviour, the fatal overlay —
// actually executes. The node:test suite can only check that the code was shipped.
export default defineConfig({
  testDir: './test/browser',
  // One app, one server, shared state (the testbed's user list is mutable): parallelism would make
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
    cwd: testbedDir,
    url: `http://127.0.0.1:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Two of these tests make the server fail on purpose — a rejected action, a section that throws
    // — and the framework reports every server-side failure with its stack. Piping that turns a
    // passing run into a wall of stack traces that reads like a crash, so it is kept for CI, where a
    // failure's only clue may be in there. Locally, `RSHONO_SERVER_LOG=1 pnpm test:browser` brings it
    // back; reach for it if the run dies waiting for the server, since the build log is in here too.
    stdout: process.env.CI || process.env.RSHONO_SERVER_LOG ? 'pipe' : 'ignore',
    stderr: process.env.CI || process.env.RSHONO_SERVER_LOG ? 'pipe' : 'ignore',
  },
});
