import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const COMPONENT_THUNK = /component:\s*(?:async\s*)?\(\s*\)\s*=>\s*import\(\s*(['"])([^'"]+)\1\s*\)/g;

const RESOLVE_CANDIDATES = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js', ''];

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
    for (const suffix of RESOLVE_CANDIDATES) {
      const candidate = base + suffix;
      if (isFile(candidate)) {
        into.add(candidate);
        break;
      }
    }
  }
}
