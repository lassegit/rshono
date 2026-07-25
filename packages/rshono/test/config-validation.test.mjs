import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildExampleWith } from './helpers.mjs';

// Config is resolved before Rspack compiles anything, so a bad security setting fails the build in
// seconds rather than producing a bundle that quietly does nothing. No server needed here.

const FIXTURES = join(fileURLToPath(import.meta.url), '..', 'fixtures');

test('a malformed allowedOrigins entry fails the build instead of silently matching nothing', () => {
  assert.throws(
    () => buildExampleWith(join(FIXTURES, 'bad-origin.config.mjs')),
    /invalid allowedOrigins entry/,
    'an unparseable origin must fail the build — an inert allowlist entry looks like a working one',
  );
});
