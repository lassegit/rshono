import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plan } from './plan.js';

/**
 * Files that do not make a directory "occupied". A user who ran `git init` or opened the folder in an
 * editor before scaffolding has not put anything in it that we would overwrite.
 */
const IGNORED_ENTRIES = new Set(['.git', '.DS_Store', '.idea', '.vscode', 'Thumbs.db']);

/**
 * What is already at the target path, ignoring the entries a fresh clone or an editor leaves behind —
 * which is what decides whether scaffolding into it is safe.
 *
 * A path that does not exist yet is no conflict. A path that exists and is *not* a directory throws
 * rather than reporting an empty list, since `--force` should not write into one either — otherwise
 * `create-rshono README.md` gets as far as `mkdir` before failing on a raw ENOTDIR.
 */
export function conflictingEntries(dir: string): string[] {
  const stats = statSync(dir, { throwIfNoEntry: false });
  if (!stats) return [];
  if (!stats.isDirectory()) throw new Error(`${dir} already exists and is not a directory.`);
  return readdirSync(dir).filter((entry) => !IGNORED_ENTRIES.has(entry));
}

/**
 * Writes the plan. Directories are created as needed, and files are written with the plan's own
 * ordering so a failure part-way through leaves something a person can make sense of.
 */
export function writePlan(plan: Plan, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const [path, contents] of plan.files) {
    const absolute = join(targetDir, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
}
