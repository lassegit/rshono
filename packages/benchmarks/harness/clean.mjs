import { rm } from 'node:fs/promises';
import path from 'node:path';
import { TARGETS, hasFlag } from './lib/targets.mjs';
import { removeAll } from './lib/sizes.mjs';

const deep = hasFlag('deep');

for (const target of TARGETS) {
  await removeAll(target.dir, target.cacheDirs);
  if (deep) {
    await rm(path.join(target.dir, 'node_modules'), { recursive: true, force: true });
    await rm(path.join(target.dir, 'package-lock.json'), { recursive: true, force: true });
  }
  console.log(`cleaned ${target.id}${deep ? ' (+ node_modules, lockfile)' : ''}`);
}
