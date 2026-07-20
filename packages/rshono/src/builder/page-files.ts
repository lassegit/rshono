/**
 * Route-component discovery for automatic 'use server-entry' injection.
 *
 * Scans routes.ts for the conventional inline thunk form
 *
 *     component: () => import('./components/home')
 *
 * and resolves each specifier to the absolute file the bundler will
 * load. The matching modules get the 'use server-entry' directive
 * prepended by page-entry-loader.cjs, so page files don't have to
 * carry it themselves.
 *
 * The scan is deliberately re-run before every (re)build — the rule
 * condition closes over a mutable Set — so routes added while the dev
 * server is running are picked up without a restart.
 *
 * Only the inline form is recognized. A component thunk built any other
 * way (variable indirection, re-export barrels, computed specifiers)
 * still works — its page module just needs the directive written
 * manually, which the loader respects.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const COMPONENT_THUNK = /component:\s*(?:async\s*)?\(\s*\)\s*=>\s*import\(\s*(['"])([^'"]+)\1\s*\)/g;

/** Same candidate order the bundler's resolver uses for these configs. */
const RESOLVE_CANDIDATES = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js', ''];

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * (Re)populate `into` with the absolute paths of all route component
 * modules referenced from routesFile. Unresolvable specifiers are
 * skipped silently — the bundler will report the broken import itself.
 */
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
