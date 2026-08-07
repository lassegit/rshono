/**
 * Finds the page modules named by inline `component: () => import('…')` thunks in `routes.ts`, so the
 * server compiler can put `page-entry-loader.cjs` in front of exactly those files and inject their
 * `'use server-entry'` directive. A page wired up any other way declares the directive itself.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const COMPONENT_THUNK = /component:\s*(?:async\s*)?\(\s*\)\s*=>\s*import\(\s*(['"])([^'"]+)\1\s*\)/g;

const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

// Index candidates go through `join` rather than `base + '/index…'`: these paths are compared against
// Rspack's own resource paths, and a hardcoded `/` stores one no Windows resource will ever equal.
function resolveCandidates(base: string): string[] {
  return [...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => join(base, `index${ext}`)), base];
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function scanPageFiles(routesFile: string, srcDir: string, into: Set<string>): void {
  into.clear();
  let source: string;
  try {
    source = readFileSync(routesFile, 'utf8');
  } catch {
    return;
  }
  for (const match of source.matchAll(COMPONENT_THUNK)) {
    const spec = match[2];
    let base: string | undefined;
    if (spec.startsWith('.')) base = resolve(dirname(routesFile), spec);
    else if (spec.startsWith('@/')) base = resolve(srcDir, spec.slice(2));
    if (!base) continue;
    for (const candidate of resolveCandidates(base)) {
      if (isFile(candidate)) {
        into.add(candidate);
        break;
      }
    }
  }
}
