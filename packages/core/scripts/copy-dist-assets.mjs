// Copies the one kind of file `tsc` doesn't emit into dist/ after a build: builder/*.cjs, the
// Rspack loaders. Hand-written CommonJS on purpose — Rspack loads them by absolute path, and CJS is
// the interop-free shape for that, so they are copied verbatim rather than compiled.
//
// `src/types/*.d.ts` deliberately stays behind. Those are ambient declarations for things only the
// framework's own sources touch (the `react-server-dom-rspack` package, the `@rshono/deploy` build
// alias, `__RSHONO_CONFIG__`, webpack's globals), and `tsc` reads them straight out of `src/` as
// compilation inputs. Nothing in the emitted declarations names them from a type position, so the
// `/// <reference>` this copy once existed to satisfy is never emitted either — shipping them only
// risked leaking those globals into a consumer's scope.
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
