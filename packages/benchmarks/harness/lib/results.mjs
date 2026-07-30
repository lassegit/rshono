import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RESULTS_DIR, ROOT } from './targets.mjs';

const LATEST = path.join(RESULTS_DIR, 'latest.json');

/**
 * Runners are independently runnable, so each one merges its section into a single latest.json
 * rather than owning a file. `run.mjs` snapshots that into a dated file at the end.
 */
export async function load() {
  if (!existsSync(LATEST)) return { env: await environment(), sections: {} };
  const parsed = JSON.parse(await readFile(LATEST, 'utf8'));
  parsed.env = await environment();
  parsed.sections ??= {};
  return parsed;
}

export async function save(results) {
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(LATEST, `${JSON.stringify(results, null, 2)}\n`);
  return LATEST;
}

export async function merge(section, data) {
  const results = await load();
  results.sections[section] = data;
  await save(results);
  return results;
}

export async function environment() {
  const cpus = os.cpus();
  return {
    // No Date.now() sugar here beyond the timestamp itself — every metric is a duration or a size.
    at: new Date().toISOString(),
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: cpus[0]?.model ?? 'unknown',
    cores: cpus.length,
    totalMemGB: +(os.totalmem() / 1024 ** 3).toFixed(1),
    node: process.version,
    ci: Boolean(process.env.CI),
    versions: await appVersions(),
  };
}

/**
 * The single most important thing to publish: React version skew is unavoidable across these three
 * and hiding it is what makes a framework-authored benchmark look dishonest.
 */
async function appVersions() {
  const out = {};
  for (const id of ['rshono', 'next', 'tanstack-start']) {
    const dir = path.join(ROOT, 'apps', id);
    const lock = path.join(dir, 'node_modules');
    if (!existsSync(lock)) {
      out[id] = { installed: false };
      continue;
    }
    out[id] = { installed: true, ...(await readVersions(lock, PROBE[id])) };
  }
  return out;
}

const PROBE = {
  rshono: ['react', 'react-dom', '@rshono/core', 'hono', '@rspack/core', 'react-server-dom-rspack'],
  next: ['react', 'react-dom', 'next'],
  'tanstack-start': ['react', 'react-dom', '@tanstack/react-start', '@tanstack/react-router', 'vite'],
};

async function readVersions(nodeModules, names = []) {
  const out = {};
  for (const name of names) {
    try {
      const pkg = JSON.parse(await readFile(path.join(nodeModules, name, 'package.json'), 'utf8'));
      out[name] = pkg.version;
    } catch {
      out[name] = null;
    }
  }
  return out;
}
