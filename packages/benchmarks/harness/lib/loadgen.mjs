import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { summarize } from './stats.mjs';

const WORKER = fileURLToPath(new URL('./load-worker.mjs', import.meta.url));

/**
 * A Node driver rather than a shell-out to oha/bombardier, on purpose: it is always present, it
 * behaves identically on every machine, and — the part that matters — it handicaps all three targets
 * in exactly the same way. Absolute rps from this driver is a lower bound on what the server can do;
 * the *ratio* between targets is the number worth reading.
 */
export async function drive(url, { connections = 32, durationMs = 8000, warmupMs = 2000, workers } = {}) {
  const threads = workers ?? Math.max(1, Math.min(4, os.cpus().length - 2));
  const per = Math.max(1, Math.floor(connections / threads));
  const actualConnections = per * threads;

  const results = await Promise.all(Array.from({ length: threads }, () => runWorker({ url, connections: per, durationMs, warmupMs })));

  const latencies = results.flatMap((r) => r.latencies);
  const statuses = {};
  for (const r of results) for (const [code, n] of Object.entries(r.statuses)) statuses[code] = (statuses[code] ?? 0) + n;

  const errors = results.reduce((a, r) => a + r.errors, 0);
  const bytes = results.reduce((a, r) => a + r.bytes, 0);
  const elapsedMs = Math.max(...results.map((r) => r.elapsedMs));
  const nonOk = Object.entries(statuses).filter(([code]) => Number(code) >= 400);

  return {
    driver: `node/${threads}w`,
    connections: actualConnections,
    durationMs,
    requests: latencies.length,
    errors,
    rps: (latencies.length / elapsedMs) * 1000,
    throughputBytesPerSec: (bytes / elapsedMs) * 1000,
    latencyMs: summarize(latencies),
    statuses,
    // A run where a quarter of the responses were 500s is not a throughput measurement.
    ok: errors === 0 && nonOk.length === 0 && latencies.length > 0,
    problem: errors > 0 ? `${errors} transport errors` : nonOk.length ? `non-2xx: ${nonOk.map(([c, n]) => `${c}×${n}`).join(', ')}` : null,
  };
}

function runWorker(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER, { workerData });
    let payload = null;
    worker.on('message', (m) => {
      payload = m;
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0 && !payload) reject(new Error(`load worker exited ${code}`));
      else resolve(payload ?? { latencies: [], errors: 0, bytes: 0, statuses: {}, elapsedMs: 1 });
    });
  });
}

/**
 * When every target lands within a few percent of every other one, the driver — not the servers —
 * is very likely the thing being measured. Flag it rather than publishing a dead heat as a finding.
 */
export function driverBoundWarning(rpsByTarget) {
  const values = Object.values(rpsByTarget).filter((v) => typeof v === 'number' && v > 0);
  if (values.length < 2) return null;
  const spread = (Math.max(...values) - Math.min(...values)) / Math.max(...values);
  return spread < 0.05
    ? `rps spread across targets is ${(spread * 100).toFixed(1)}% — likely driver-bound, not server-bound. Re-run on a bigger box, or against a standalone driver such as oha, before quoting these.`
    : null;
}
