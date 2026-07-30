/**
 * Installs each benchmark app into its own isolated node_modules.
 *
 * The apps are deliberately *not* pnpm workspace members: the root pnpm-workspace.yaml pins react,
 * react-dom and @rspack/core with `overrides`, and forcing those onto Next and TanStack Start would
 * be measuring a configuration nobody ships. Isolated npm installs also make the install-footprint
 * numbers in footprint.mjs mean something.
 */
import { existsSync } from 'node:fs';
import { mkdir, copyFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { run } from './lib/proc.mjs';
import { resolveTargets, ROOT, FIXTURES } from './lib/targets.mjs';
import { ms } from './lib/stats.mjs';

const targets = resolveTargets();
const monorepoRoot = path.resolve(ROOT, '..', '..');
const coreDir = path.join(monorepoRoot, 'packages', 'core');
const packDir = path.join(ROOT, '.pack');

// AGENTS.md: packages/core has to be built before anything consumes it through node_modules.
console.log('› building @rshono/core');
const core = await run('pnpm', ['--filter', '@rshono/core', 'build'], { cwd: monorepoRoot, label: 'core build' });
if (core.code !== 0) process.exit(1);
console.log(`  ✓ ${ms(core.ms)}`);

/**
 * The rshono app installs @rshono/core from a packed tarball rather than a `file:` link to
 * packages/core. A link resolves core's own `react` import to packages/core/node_modules/react while
 * the app's components resolve to the app's copy — two real paths, two React instances, and a null
 * hook dispatcher the moment a client component is SSR'd. A tarball is extracted into the app's
 * node_modules, so everything walks up to one react. It is also what an `npm i @rshono/core` does,
 * which is the thing being benchmarked.
 */
console.log('› packing @rshono/core');
await rm(packDir, { recursive: true, force: true });
await mkdir(packDir, { recursive: true });
const packed = await run('npm', ['pack', '--ignore-scripts', '--pack-destination', packDir], { cwd: coreDir, label: 'npm pack' });
if (packed.code !== 0) process.exit(1);
const tarball = (await readdir(packDir)).find((f) => f.endsWith('.tgz'));
if (!tarball) {
  console.error('  ✗ npm pack produced no tarball');
  process.exit(1);
}
await copyFile(path.join(packDir, tarball), path.join(packDir, 'rshono-core.tgz'));
console.log(`  ✓ ${tarball} → .pack/rshono-core.tgz`);

let failed = false;
for (const target of targets) {
  // One fixture file, copied in rather than imported across roots: Rspack, Turbopack and Vite each
  // have their own opinion about a specifier that escapes the project directory, and the benchmark
  // has no business discovering which. Gitignored — fixtures/data.json stays the only source.
  const generated = path.join(target.dir, 'src', 'generated');
  await mkdir(generated, { recursive: true });
  await copyFile(FIXTURES, path.join(generated, 'data.json'));

  console.log(`› installing ${target.id}`);
  // A rebuilt tarball has to replace whatever is already extracted, and `npm ci` will not do that
  // from a lockfile that records the old integrity hash.
  const tarballDep = target.id === 'rshono';
  if (tarballDep) await rm(path.join(target.dir, 'node_modules', '@rshono'), { recursive: true, force: true });
  const lock = path.join(target.dir, 'package-lock.json');
  const args = existsSync(lock) && !tarballDep ? ['ci'] : ['install'];
  const res = await run('npm', [...args, '--no-audit', '--no-fund'], { cwd: target.dir, label: `${target.id} npm ${args[0]}` });
  if (res.code !== 0) {
    failed = true;
    continue;
  }
  console.log(`  ✓ npm ${args[0]} in ${ms(res.ms)}`);
}

process.exit(failed ? 1 : 0);
