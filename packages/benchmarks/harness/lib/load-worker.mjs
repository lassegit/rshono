import { parentPort, workerData } from 'node:worker_threads';
import http from 'node:http';

const { url, connections, durationMs, warmupMs } = workerData;
const target = new URL(url);
const agent = new http.Agent({ keepAlive: true, maxSockets: connections, maxFreeSockets: connections });

const options = {
  hostname: target.hostname,
  port: target.port,
  path: target.pathname + target.search,
  method: 'GET',
  agent,
  headers: { accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'accept-encoding': 'identity' },
};

const latencies = [];
const statuses = {};
let errors = 0;
let bytes = 0;

const startAt = performance.now();
const warmupUntil = startAt + warmupMs;
const endAt = warmupUntil + durationMs;

function once() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const req = http.request(options, (res) => {
      let n = 0;
      res.on('data', (chunk) => {
        n += chunk.length;
      });
      res.on('end', () => {
        // Samples taken during warmup are discarded rather than weighted down — JIT and the first
        // pass through a lazily-required module graph are not what we're measuring.
        if (performance.now() > warmupUntil) {
          latencies.push(performance.now() - t0);
          bytes += n;
          statuses[res.statusCode] = (statuses[res.statusCode] ?? 0) + 1;
        }
        resolve();
      });
      res.on('error', () => {
        if (performance.now() > warmupUntil) errors += 1;
        res.resume();
        resolve();
      });
    });
    req.on('error', () => {
      if (performance.now() > warmupUntil) errors += 1;
      resolve();
    });
    req.end();
  });
}

async function pump() {
  while (performance.now() < endAt) await once();
}

await Promise.all(Array.from({ length: connections }, pump));

parentPort.postMessage({
  latencies,
  errors,
  bytes,
  statuses,
  elapsedMs: Math.max(1, performance.now() - warmupUntil),
});
