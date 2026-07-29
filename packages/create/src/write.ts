import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plan } from './plan.js';

/** What is already at the target path, which decides whether scaffolding into it is safe. */
export interface TargetState {
  exists: boolean;
  /** Entries already there, ignoring the ones a fresh clone or an editor leaves behind. */
  conflicts: string[];
}

/**
 * Files that do not make a directory "occupied". A user who ran `git init` or opened the folder in an
 * editor before scaffolding has not put anything in it that we would overwrite.
 */
const IGNORED_ENTRIES = new Set(['.git', '.DS_Store', '.idea', '.vscode', 'Thumbs.db']);

export function inspectTarget(dir: string): TargetState {
  if (!existsSync(dir)) return { exists: false, conflicts: [] };
  return { exists: true, conflicts: readdirSync(dir).filter((entry) => !IGNORED_ENTRIES.has(entry)) };
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
