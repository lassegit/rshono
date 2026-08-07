/**
 * Proves the rshono app is measuring the `@rshono/core` in this checkout, and not an older one.
 *
 * The app installs core from `.pack/rshono-core.tgz` rather than a workspace link (see install.mjs for
 * why — a link gives the app two Reacts). Nothing re-packs that tarball except `setup:apps`, so every
 * `bench` after a change to packages/core measures whatever was packed last, silently. That is not a
 * hypothetical: a run measured an app whose `/ssr` 500'd on every request against a core four release
 * candidates old, and reported it as 2,828 rps — ten times the real figure, because a 500 skips the
 * render entirely. A stale core does not usually announce itself that loudly.
 *
 * The comparison is over file *contents*, deliberately, and not the version in `package.json`. npm
 * writes that field from the lockfile entry rather than from the tarball, so a re-pack that keeps the
 * same path leaves `node_modules/@rshono/core/package.json` claiming the version it was first locked
 * at while the `dist` beside it is new — observed in this repo, saying `1.0.0-rc.3` over an rc.7 tree.
 * A version check would therefore report staleness that had already been fixed, and (worse) miss a
 * rebuild that never changed the version at all, which is every rebuild during development.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * A content hash of every file under `dir`, path-sensitive and order-independent. `null` if absent.
 *
 * Dotfiles are skipped on both sides because npm refuses to pack several of them whatever `files`
 * says — `.DS_Store` above all, which macOS writes into any directory Finder has looked at. Counting
 * one would put it in the workspace hash and never in the installed one, and the two trees could then
 * never agree: every benchmark would refuse to run, blaming a stale core that was perfectly current.
 * Nothing `tsc` emits into `dist` begins with a dot, so there is nothing legitimate to lose.
 */
function hashTree(dir) {
  if (!existsSync(dir)) return null;
  const hash = createHash('sha256');
  const walk = (absolute, relative) => {
    const entries = readdirSync(absolute, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const child = path.join(absolute, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child, rel);
      else if (entry.isFile()) hash.update(rel).update(readFileSync(child));
    }
  };
  walk(dir, '');
  return hash.digest('hex');
}

/**
 * `null` when the installed core matches the workspace build, otherwise a sentence saying how it
 * doesn't. Compares `dist`, which is the whole of what the tarball ships that a benchmark can execute.
 */
export function coreStaleness(benchmarksRoot, appDir) {
  const workspace = path.resolve(benchmarksRoot, '..', 'core', 'dist');
  const installed = path.join(appDir, 'node_modules', '@rshono', 'core', 'dist');

  if (!existsSync(workspace)) return 'packages/core has not been built, so there is nothing to compare against.';
  if (!existsSync(installed)) return 'the app has no @rshono/core installed.';
  return hashTree(workspace) === hashTree(installed) ? null : 'the app has an older @rshono/core installed than this checkout builds.';
}

/**
 * Stops the stage rather than letting it measure the wrong code. Called from `resolveTargets`, so
 * every runner inherits it; `install.mjs` opts out, being the thing that fixes what this detects.
 *
 * Prints and exits instead of throwing, which the rest of `resolveTargets` does. This is a *setup*
 * precondition rather than a bug in the harness, and the whole value of catching it is the two lines
 * saying what to run — under a Node stack trace those are something to scroll past, which is precisely
 * how the warning this guard replaces got ignored.
 */
export function assertCoreFresh(benchmarksRoot, targets) {
  const app = targets.find((t) => t.id === 'rshono');
  if (!app) return;
  const stale = coreStaleness(benchmarksRoot, app.dir);
  if (!stale) return;
  console.error(
    [
      `✗ Refusing to benchmark a stale @rshono/core — ${stale}`,
      '  Every number this run produced would describe code that is not in the working tree.',
      '',
      '  Fix:  pnpm --filter @rshono/benchmarks setup:apps',
      '        (rebuilds core, re-packs it, reinstalls, and drops the rshono build that linked the old one)',
      '  Then: pnpm --filter @rshono/benchmarks bench      — or rebuild just the app before a single stage',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
