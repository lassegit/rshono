// Copies the files `tsc` doesn't emit into dist/ after a build.
//
// Two kinds, both needed at runtime by a *consumer's* build:
//   - builder/*.cjs — Rspack loaders. Hand-written CommonJS on purpose: Rspack loads them by
//     absolute path, and CJS is the interop-free shape for that, so they are copied verbatim
//     rather than compiled.
//   - types/*.d.ts — ambient declarations. `tsc` treats a .d.ts as an input, never an output, so
//     without this the `/// <reference>` that lands in the emitted declarations would dangle.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Array<{ from: string; to: string; match: (file: string) => boolean }>} */
const groups = [
  { from: join('src', 'builder'), to: join('dist', 'builder'), match: (file) => file.endsWith('.cjs') },
  { from: join('src', 'types'), to: join('dist', 'types'), match: (file) => file.endsWith('.d.ts') },
];

let copied = 0;
for (const group of groups) {
  const fromDir = join(packageDir, group.from);
  const toDir = join(packageDir, group.to);
  mkdirSync(toDir, { recursive: true });
  for (const file of readdirSync(fromDir).filter(group.match)) {
    cpSync(join(fromDir, file), join(toDir, file));
    copied++;
  }
}

console.log(`  • copied ${copied} non-compiled asset(s) into dist/`);
