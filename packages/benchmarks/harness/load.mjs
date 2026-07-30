/**
 * Throughput and latency per route, plus resident memory under load.
 *
 * Read this section as the *floor check* it is: all three render through the same React and stream
 * through the same react-dom, so a large gap here would mean someone's HTTP layer is pathological,
 * not that one framework renders React faster. `/api/health` is the interesting row — it takes React
 * out of the path entirely and leaves only the router and response construction.
 */
import { resolveTargets, ROUTES, flagValue, hasFlag } from './lib/targets.mjs';
import { startServer, portFree } from './lib/proc.mjs';
import { drive, driverBoundWarning } from './lib/loadgen.mjs';
import { treeRss } from './lib/rss.mjs';
import { ms, num, bytes } from './lib/stats.mjs';
import { merge } from './lib/results.mjs';

const targets = resolveTargets();
const connections = Number(flagValue('connections', '32'));
const durationMs = Number(flagValue('duration', '8')) * 1000;
const warmupMs = Number(flagValue('warmup', '2')) * 1000;
const quick = hasFlag('quick');

const settings = {
  connections,
  durationMs: quick ? 2000 : durationMs,
  warmupMs: quick ? 500 : warmupMs,
};

for (const target of targets) {
  if (!(await portFree(target.port))) {
    console.error(`✗ port ${target.port} is already answering — something is still running from a previous run.`);
    process.exit(1);
  }
}

const out = { settings, targets: {} };

for (const target of targets) {
  console.log(`\n=== ${target.label} ===`);
  let server;
  try {
    server = await startServer(target);
  } catch (error) {
    out.targets[target.id] = { label: target.label, error: error.message };
    console.log(`  ✗ ${error.message.split('\n')[0]}`);
    continue;
  }

  const routes = {};
  let rssIdle = null;
  let rssLoaded = null;
  try {
    rssIdle = await treeRss(server.pid);
    for (const route of ROUTES) {
      const result = await drive(server.base + route.path, settings);
      routes[route.id] = result;
      console.log(
        `  ${route.path.padEnd(14)} ${num(result.rps).padStart(8)} rps` +
          `  p50 ${ms(result.latencyMs.p50).padStart(8)}` +
          `  p99 ${ms(result.latencyMs.p99).padStart(8)}` +
          `  ${result.ok ? '' : `⚠ ${result.problem}`}`,
      );
      rssLoaded = await treeRss(server.pid);
    }
  } finally {
    await server.stop();
  }

  out.targets[target.id] = { label: target.label, routes, rssIdle, rssLoaded, startupMs: server.readyMs };
  if (rssIdle) console.log(`  rss idle ${bytes(rssIdle.bytes)} (${rssIdle.processes} proc) → loaded ${bytes(rssLoaded?.bytes)}`);
}

for (const route of ROUTES) {
  const byTarget = Object.fromEntries(Object.entries(out.targets).map(([id, t]) => [id, t.routes?.[route.id]?.rps]));
  const warning = driverBoundWarning(byTarget);
  if (warning) {
    out.targets._warnings ??= {};
    out.targets._warnings[route.id] = warning;
    console.log(`\n⚠ ${route.path}: ${warning}`);
  }
}

await merge('load', out);
console.log('\nwrote results/latest.json → sections.load');
