// Copies the one kind of file `tsc` does not emit into dist/: builder/*.cjs, the Rspack loaders.
// Hand-written CommonJS on purpose — Rspack loads them by absolute path — so they are copied verbatim
// rather than compiled.
//
// `src/types/*.d.ts` deliberately stays behind. Those are ambient declarations for things only the
// framework's own sources touch, `tsc` reads them straight out of `src/` as compilation inputs, and
// nothing in the emitted declarations names them — so shipping them would only risk leaking those
// globals into a consumer's scope.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const fromDir = join(packageDir, 'src', 'builder');
const toDir = join(packageDir, 'dist', 'builder');

mkdirSync(toDir, { recursive: true });
const loaders = readdirSync(fromDir).filter((file) => file.endsWith('.cjs'));
for (const file of loaders) {
  cpSync(join(fromDir, file), join(toDir, file));
}

console.log(`  • copied ${loaders.length} Rspack loader(s) into dist/`);
