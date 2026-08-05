/**
 * Copies the rendered results into `apps/website/content/benchmarks.md`.
 *
 * `results/latest.md` is generated and gitignored, so the website cannot import it — a fresh clone or a
 * CI build would have nothing to read. The published copy is committed instead, and this script is how
 * it gets refreshed: run `bench`, then run this.
 *
 * What lands in the content file is **only the measured tables**. The framing — what the numbers mean,
 * what they don't, which caveats change how you should read them — is authored JSX in
 * `apps/website/src/components/benchmarks.tsx`, so regenerating data can never quietly overwrite prose
 * that took judgement to write.
 *
 * A second file, `benchmarks-summary.json`, carries the at-a-glance scorecard: the handful of headline
 * metrics pulled out of `latest.json`, each with every target's value and which one won. It is generated
 * for one reason — a hand-written "2.7× smaller" in the page would drift from the tables underneath it
 * the first time anyone re-ran the benchmark, and a summary that contradicts its own detail is worse than
 * no summary.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, RESULTS_DIR, TARGETS } from './lib/targets.mjs';
import { bytes, ms, num } from './lib/stats.mjs';

const source = path.join(RESULTS_DIR, 'latest.md');
const destination = path.resolve(ROOT, '..', '..', 'apps', 'website', 'content', 'benchmarks.md');
const summaryDestination = path.resolve(ROOT, '..', '..', 'apps', 'website', 'content', 'benchmarks-summary.json');

if (!existsSync(source)) {
  console.error(`✗ ${path.relative(process.cwd(), source)} does not exist — run \`pnpm bench\` first.`);
  process.exit(1);
}

const report = await results();
const markdown = await readFile(source, 'utf8');

/*
 * Everything from the first `##` on. The report's own H1 and its "Generated … see ../README.md" line
 * are both dropped: the page component renders the heading, and that relative link resolves to nothing
 * once the file is served from a website.
 */
const firstSection = markdown.indexOf('\n## ');
if (firstSection === -1) {
  console.error('✗ no `##` section found in latest.md — has the report format changed?');
  process.exit(1);
}
const body = markdown.slice(firstSection + 1).trimEnd();

const measuredOn = report?.env?.at ? report.env.at.slice(0, 10) : 'an unrecorded date';
const stages = report?.run?.stages?.join(', ') ?? 'a partial run';

const out = `---
title: Benchmarks
description: One app built three ways — rshono, Next.js and TanStack Start — measured on payload bytes, build time, cold start and install size.
---

_Generated from \`packages/benchmarks\` on ${measuredOn} (${stages}). One run, one machine. Regenerate with
\`pnpm --filter @rshono/benchmarks bench\` and \`pnpm --filter @rshono/benchmarks site:publish\`._

${body}
`;

await writeFile(destination, out);
console.log(`✓ wrote ${path.relative(path.resolve(ROOT, '..', '..'), destination)} (${(out.length / 1024).toFixed(1)} kB, measured ${measuredOn})`);

/**
 * The scorecard metrics, in the order the page shows them.
 *
 * `anchor` is the id `markdown-it-anchor` gives the matching heading in the generated markdown, so every
 * summary row can link down to the table it came from — the overview is a way into the detail, not a
 * replacement for it.
 *
 * Every metric is emitted with its `winner`, including the ones rshono loses. The website's scorecard
 * shows only the wins — that filter lives in the page component, deliberately, so this file stays a
 * faithful dump of what was measured and the editorial choice is visible where it is made. Which rows
 * rshono wins is not fixed either: `coldstart` has changed hands between runs by less than the
 * measurement noise, so nothing anywhere hard-codes the split.
 */
const METRICS = [
  {
    id: 'payload-home',
    comparative: 'smaller',
    label: 'Initial payload, prerendered page',
    hint: 'brotli, document + JS + CSS',
    lowerIsBetter: true,
    anchor: 'initial-load-payload',
    format: bytes,
    pick: (s, t) => s.payload?.[t]?.routes?.home?.total?.brotli,
  },
  {
    id: 'payload-interactive',
    comparative: 'smaller',
    label: 'Initial payload, three client components',
    hint: 'brotli',
    lowerIsBetter: true,
    anchor: 'initial-load-payload',
    format: bytes,
    pick: (s, t) => s.payload?.[t]?.routes?.interactive?.total?.brotli,
  },
  {
    id: 'requests-home',
    comparative: 'fewer',
    label: 'Requests before first paint',
    hint: 'prerendered page',
    lowerIsBetter: true,
    anchor: 'initial-load-payload',
    format: (v) => `${v}`,
    pick: (s, t) => s.payload?.[t]?.routes?.home?.requests,
  },
  {
    id: 'build-cold',
    comparative: 'faster',
    label: 'Cold production build',
    hint: 'median of the trials',
    lowerIsBetter: true,
    anchor: 'build',
    format: ms,
    pick: (s, t) => s.build?.[t]?.coldMs?.median,
  },
  {
    id: 'devstart-cold',
    comparative: 'faster',
    label: 'Cold dev server start',
    hint: 'to a served /interactive',
    lowerIsBetter: true,
    anchor: 'dev-server-startup',
    format: ms,
    pick: (s, t) => s.devstart?.[t]?.coldMs?.median,
  },
  {
    id: 'api-rps',
    comparative: 'more',
    label: 'JSON endpoint throughput',
    hint: 'no React on the path',
    lowerIsBetter: false,
    anchor: 'throughput',
    format: (v) => `${num(v)} rps`,
    pick: (s, t) => s.load?.targets?.[t]?.routes?.api?.rps,
  },
  {
    id: 'coldstart',
    comparative: 'faster',
    label: 'Spawn to first response',
    hint: 'fresh process',
    lowerIsBetter: true,
    anchor: 'cold-start',
    format: ms,
    pick: (s, t) => s.coldstart?.[t]?.readyMs?.median,
  },
  {
    id: 'ssr-rps',
    comparative: 'more',
    label: '100-row page throughput',
    hint: 'rendered per request',
    lowerIsBetter: false,
    anchor: 'throughput',
    format: (v) => `${num(v)} rps`,
    pick: (s, t) => s.load?.targets?.[t]?.routes?.ssr?.rps,
  },
  {
    id: 'home-rps',
    comparative: 'more',
    label: 'Prerendered page throughput',
    hint: 'served from disk',
    lowerIsBetter: false,
    anchor: 'throughput',
    format: (v) => `${num(v)} rps`,
    pick: (s, t) => s.load?.targets?.[t]?.routes?.home?.rps,
  },
  {
    id: 'interactive-rps',
    comparative: 'more',
    label: 'Interactive page throughput',
    hint: 'three client components',
    lowerIsBetter: false,
    anchor: 'throughput',
    format: (v) => `${num(v)} rps`,
    pick: (s, t) => s.load?.targets?.[t]?.routes?.interactive?.rps,
  },
  /*
   * Memory, and only the three rows that mean something.
   *
   * `largest` rather than the tree total on both RSS rows: the tree sums whatever `npm run start` left
   * running and double-counts shared pages, and the largest process is the server itself in all three
   * apps — so it is the only one of the two that compares like with like.
   *
   * `churn` is the row to trust. RSS after a fixed-duration load is a high-water mark that includes
   * garbage V8 has not collected, and V8 sizes the old generation against the *allocation rate*, so the
   * server that answered the most requests grows the largest heap. Dividing the growth by requests
   * served is what removes that bias.
   */
  {
    id: 'rss-idle',
    comparative: 'smaller',
    label: 'Server memory, idle',
    hint: 'RSS before any load',
    lowerIsBetter: true,
    anchor: 'memory',
    format: bytes,
    pick: (s, t) => s.load?.targets?.[t]?.rssIdle?.largest,
  },
  {
    id: 'rss-loaded',
    comparative: 'smaller',
    label: 'Server memory, after load',
    hint: 'RSS high-water mark, 256 MB old space',
    lowerIsBetter: true,
    anchor: 'memory',
    format: bytes,
    pick: (s, t) => s.load?.targets?.[t]?.rssLoaded?.largest,
  },
  {
    id: 'churn',
    comparative: 'smaller',
    label: 'Memory churn per 1k requests',
    hint: 'growth ÷ requests served',
    lowerIsBetter: true,
    anchor: 'memory',
    format: bytes,
    pick: (s, t) => {
      const target = s.load?.targets?.[t];
      const served = Object.values(target?.routes ?? {}).reduce((sum, route) => sum + (route?.requests ?? 0), 0);
      const idle = target?.rssIdle?.largest;
      const loaded = target?.rssLoaded?.largest;
      if (!served || !idle || !loaded) return undefined;
      return Math.max(0, ((loaded - idle) / served) * 1000);
    },
  },
  {
    id: 'build-output',
    comparative: 'smaller',
    label: 'Build output size',
    hint: 'everything the build wrote',
    lowerIsBetter: true,
    anchor: 'build',
    format: bytes,
    pick: (s, t) => s.build?.[t]?.artifacts?.totalBytes,
  },
  {
    id: 'install',
    comparative: 'smaller',
    label: 'Production install',
    hint: 'npm install --omit=dev',
    lowerIsBetter: true,
    anchor: 'footprint',
    format: bytes,
    pick: (s, t) => s.footprint?.[t]?.install?.bytes,
  },
];

/** The three the page leads with — biggest honest margins, one per kind of cost. */
const HEADLINE = ['payload-home', 'build-cold', 'requests-home'];

const sections = report?.sections ?? {};
const metrics = [];

for (const metric of METRICS) {
  const values = TARGETS.map((target) => ({ target: target.id, label: target.label, value: metric.pick(sections, target.id) })).filter(
    (v) => typeof v.value === 'number' && Number.isFinite(v.value),
  );
  // A metric measured for only some targets cannot be won or lost — drop it rather than crown a
  // winner out of an incomplete field (e.g. `footprint` when `bench` ran without `--footprint`).
  if (values.length < TARGETS.length) continue;

  const ordered = [...values].sort((a, b) => (metric.lowerIsBetter ? a.value - b.value : b.value - a.value));
  const best = ordered[0];
  const worst = ordered[ordered.length - 1];
  const factor = metric.lowerIsBetter ? worst.value / best.value : best.value / worst.value;

  metrics.push({
    id: metric.id,
    label: metric.label,
    hint: metric.hint,
    anchor: metric.anchor,
    lowerIsBetter: metric.lowerIsBetter,
    /*
     * The comparative word is per metric, not derived from `lowerIsBetter`. Picking it from the
     * direction gives "7.4× less than Next.js" for a build time, which is not what anyone means —
     * durations are faster, byte counts smaller, request counts fewer, throughput more.
     */
    comparative: metric.comparative,
    winner: best.target,
    /*
     * `relativeToBest` is what the bar length draws, and it is deliberately not the raw value.
     *
     * Each metric has its own scale — milliseconds and kilobytes share no axis — so a bar has to be
     * normalised per row. Normalising against the raw maximum would make the *longest* bar the worst
     * result on a lower-is-better row and the best one on a throughput row, so bar length would mean
     * the opposite thing in different rows of the same card. Normalising against the winner instead
     * makes longer always better, everywhere. The measured value is printed beside every bar, so the
     * number is never inferred from the geometry.
     */
    values: values.map((v) => ({
      ...v,
      display: metric.format(v.value),
      relativeToBest: metric.lowerIsBetter ? best.value / v.value : v.value / best.value,
    })),
    gap: { factor: Number(factor.toFixed(1)), bestLabel: best.label, worstLabel: worst.label },
  });
}

const summary = {
  measuredOn,
  machine: report?.env?.cpu ? `${report.env.cpu} · ${report.env.cores} cores` : null,
  targets: TARGETS.map((t) => ({ id: t.id, label: t.label })),
  headline: HEADLINE.map((id) => metrics.find((m) => m.id === id)).filter(Boolean),
  metrics,
};

await writeFile(summaryDestination, `${JSON.stringify(summary, null, 2)}\n`);
const wins = metrics.filter((m) => m.winner === 'rshono').length;
console.log(
  `✓ wrote ${path.relative(path.resolve(ROOT, '..', '..'), summaryDestination)} — ${metrics.length} metrics, rshono ahead on ${wins}, behind on ${metrics.length - wins}`,
);

async function results() {
  const file = path.join(RESULTS_DIR, 'latest.json');
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, 'utf8'));
}
