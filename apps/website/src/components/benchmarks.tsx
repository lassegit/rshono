import { Fragment } from 'react';
import type { PageProps } from '@rshono/core';
import source from '../../content/benchmarks.md';
import summary from '../../content/benchmarks-summary.json';
import { renderDoc } from '../content/markdown';
import { DocsToc } from './docs-toc';
import { Layout } from './layout';

/**
 * `/benchmarks` — one app built three ways, measured.
 *
 * The tables come from `content/benchmarks.md`, which is generated: `pnpm --filter @rshono/benchmarks
 * bench` measures, then `site:publish` copies the report in. Everything around them — {@link Intro},
 * {@link HowToRead} — is authored here on purpose, so regenerating the data can never overwrite the
 * part that took judgement.
 *
 * The framing matters more than usual here. A benchmark published by a framework's own author is read
 * sceptically by default, and it should be: the honest counter is a reproducible method, the caveats on
 * the same page as the numbers, and complete tables — every metric, all three columns, whichever way the
 * row went. {@link Scorecard} leads with what rshono is good at, which is what a summary is for; it says
 * how many metrics it is behind on and links to each, so the highlights never read as the whole picture.
 */
export default async function Benchmarks({ url }: PageProps<'/benchmarks'>) {
  const { title, description, html, toc } = await renderDoc(source);

  return (
    <Layout title={title} description={description} canonical={url.href} wide>
      <div className="mx-auto w-full max-w-7xl px-0 lg:px-6 xl:grid xl:grid-cols-[minmax(0,1fr)_15rem] xl:gap-8">
        <article className="min-w-0 px-6 py-10 lg:px-0">
          <Intro title={title} description={description} />
          <Headline />
          <Scorecard />
          <HowToRead />

          {/* Generated from files in this repository, rendered at build time — not user input. */}
          <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />

          <Reproduce />
        </article>

        <DocsToc toc={toc} markdownHref="/benchmarks.md" />
      </div>
    </Layout>
  );
}

const BENCH_URL = 'https://github.com/rshono/rshono/tree/main/packages/benchmarks';

function Intro({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-8">
      <p className="mb-2 text-sm font-medium text-sky-700 dark:text-sky-400">Measured</p>
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">{title}</h1>
      <p className="mt-3 text-lg text-pretty text-zinc-600 dark:text-zinc-400">{description}</p>

      <div className="mt-6 space-y-4 text-zinc-600 dark:text-zinc-400">
        <p>
          All three of these render through the same React and stream through the same <code>react-dom</code>. rshono&rsquo;s render path is a thin
          shell over <code>react-server-dom-rspack</code> and <code>react-dom/server</code> — the same packages Next drives. So a requests-per-second
          headline over that shared machinery mostly measures whose HTTP layer sits in front of it, and any gap it shows is as likely to be React
          version skew as framework design.
        </p>
        <p>
          Throughput is therefore in here as a floor check and nothing more. What the tables are actually about is the cost the framework decides:{' '}
          <strong className="font-medium text-zinc-900 dark:text-white">how many bytes reach the browser</strong>, how long a build takes, how much
          JavaScript has to be parsed before the first response, and how big the dependency is.
        </p>
      </div>
    </header>
  );
}

type Metric = (typeof summary.metrics)[number];

/**
 * The three numbers the page leads with.
 *
 * A KPI row of stat tiles rather than a chart: a handful of headline figures is not a plot, and a
 * grouped bar chart of three unrelated units would be one axis pretending to be three. Values use the
 * font's proportional figures — `tabular-nums` would make `450ms` look loose at this size, and nothing
 * here needs to align vertically.
 */
function Headline() {
  return (
    <section
      aria-label="Headline results"
      className="mb-10 grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800"
    >
      {summary.headline.map((metric) => {
        const rshono = metric.values.find((v) => v.target === 'rshono');
        if (!rshono) return null;
        return (
          <div key={metric.id} className="bg-white p-5 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{metric.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">{rshono.display}</p>
            <p className="mt-1 text-sm text-sky-700 dark:text-sky-400">
              {metric.gap.factor}× {metric.comparative} than {metric.gap.worstLabel}
            </p>
          </div>
        );
      })}
    </section>
  );
}

/**
 * The scorecard — the metrics rshono leads.
 *
 * It is a highlights reel, not the result set, and the copy has to say so: `benchmarks-summary.json`
 * still carries every metric with its winner, and the filter is here in the presentation layer rather
 * than in the generator, so what the page shows is a deliberate editorial choice and not a gap in the
 * data. The metrics rshono loses are one scroll down, in full, in the tables — the summary links into
 * them and the note below names them. Leaving them out of the summary *and* not saying so is the one
 * version of this that would mislead.
 *
 * Emphasis rather than a categorical palette: the reader's question is "where does rshono land", so
 * rshono carries the accent and the other two are the de-emphasis gray. Three categorical hues would
 * spend colour on identity that the row labels already carry, and would bury the one series the page is
 * about.
 *
 * The gray sits under 3:1 against both surfaces, which obliges relief rather than being dismissable —
 * so every bar is directly labelled with its framework and its measured value, and the same numbers
 * appear again in the tables below. Colour is never the only channel.
 */
function Scorecard() {
  const ahead = summary.metrics.filter((m) => m.winner === 'rshono');
  const behind = summary.metrics.filter((m) => m.winner !== 'rshono');
  // Who beat us, deduplicated — three lost metrics can be one winner. The verb has to agree with this
  // list, not with the number of metrics.
  // `flatMap` with `?? []` rather than `.filter(Boolean)`: the latter drops the undefineds at runtime
  // but does not narrow the type, so `Intl.ListFormat` would be handed `(string | undefined)[]`.
  const winners = [...new Set(behind.flatMap((m) => m.values.find((v) => v.target === m.winner)?.label ?? []))];

  return (
    <section aria-label="Scorecard" className="mb-12">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">At a glance</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Bar length is each result against the best in its row — longer is better. The value beside it is what was measured.
        </p>
      </div>

      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {ahead.map((metric) => (
          <MetricRow key={metric.id} metric={metric} />
        ))}
      </div>

      {behind.length > 0 && (
        <p className="mt-6 border-t border-zinc-200 pt-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          These are the {ahead.length} metrics rshono leads. It is behind on {behind.length} —{' '}
          {behind.map((metric, index) => (
            <Fragment key={metric.id}>
              {index > 0 && (index === behind.length - 1 ? ' and ' : ', ')}
              <a href={`#${metric.anchor}`}>{metric.label.toLowerCase()}</a>
            </Fragment>
          ))}
          , where {new Intl.ListFormat('en').format(winners)} {winners.length === 1 ? 'wins' : 'win'}. Every table below has all three columns.
        </p>
      )}
    </section>
  );
}

function MetricRow({ metric }: { metric: Metric }) {
  return (
    <div>
      <p className="text-sm font-medium text-zinc-900 dark:text-white">
        {/* Each row links down to the table it came from — the overview is a way into the detail. */}
        <a href={`#${metric.anchor}`} className="no-underline hover:underline">
          {metric.label}
        </a>
      </p>
      <p className="mb-2.5 text-xs text-zinc-500 dark:text-zinc-400">{metric.hint}</p>

      {/*
        One grid for all three results rather than a grid per result: `auto` then sizes the name column
        to the longest label, so the bars still line up *and* nothing has to be truncated to fit a width
        guessed in advance. A clipped label is the failure mode worth designing out — "TanStack Start" is
        long enough to be at risk in a fixed column, and a cropped name is unreadable rather than merely
        tight.
      */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1">
        {metric.values.map((value) => {
          const isRshono = value.target === 'rshono';
          const ink = isRshono ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400';
          return (
            <Fragment key={value.target}>
              <span className={`text-xs whitespace-nowrap ${isRshono ? 'font-medium' : ''} ${ink}`}>{value.label}</span>
              {/* Track is a lighter step of the same neutral, so a short bar still reads against a scale. */}
              <span className="h-2 w-full overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800">
                {/* Thin mark, 4px rounded data-end, square at the baseline it grows from. */}
                <span
                  className={`block h-full rounded-r-[4px] ${isRshono ? 'bg-sky-600 dark:bg-sky-400' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                  style={{ width: `${Math.max(value.relativeToBest * 100, 2)}%` }}
                />
              </span>
              {/* A column of numbers that must align vertically — the one place `tabular-nums` belongs. */}
              <span className={`text-xs tabular-nums ${isRshono ? 'font-medium' : ''} ${ink}`}>{value.display}</span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The caveats, above the numbers rather than under them.
 *
 * Every one of these is a limitation of the comparison, not of a framework, and each was found by
 * building the thing — the `vite preview` asymmetry and the client-router serialization cost in
 * particular are the kind of detail that decides whether a table is fair.
 */
function HowToRead() {
  return (
    <section className="my-10 rounded-lg border border-amber-300/60 bg-amber-50/60 p-5 dark:border-amber-500/30 dark:bg-amber-500/5">
      <h2 className="mb-3 text-sm font-semibold tracking-wider text-amber-900 uppercase dark:text-amber-300">How to read this</h2>
      <ul className="space-y-2.5 text-sm text-zinc-700 dark:text-zinc-300">
        <li>
          <strong className="font-medium">Payload and size numbers are exact; timings are not.</strong> These were measured on a laptop, where thermal
          throttling moves build and throughput numbers more than most of the differences being compared. Every timing prints its spread (
          <code>±7%</code>) — treat anything inside it as a tie.
        </li>
        <li>
          <strong className="font-medium">React versions differ and are reported, not hidden.</strong> Next vendors its own React copy, so the three
          do not run identical renderers and cannot be made to. That is the most likely reason for a few percent on any render path.
        </li>
        <li>
          <strong className="font-medium">
            TanStack Start is served by <code>vite preview</code>.
          </strong>{' '}
          It is the official way to run its production build locally, but it is a preview server rather than a deployment target — a real deploy goes
          through a platform preset. Its static-route throughput especially should not be read as its deployed performance. rshono and Next both run
          their own production servers.
        </li>
        <li>
          <strong className="font-medium">TanStack Start is client-router-first.</strong> Its loader data is serialized into the document for the
          client router to hydrate, which an RSC framework does not pay. That is an architectural difference, not a defect.
        </li>
        <li>
          <strong className="font-medium">The summary above is a highlights reel; the tables are the result set.</strong> It shows the metrics rshono
          leads, names the ones it doesn&rsquo;t, and links to them. Every table below carries all three columns whichever way the row went — nothing
          is filtered out of the measured data, and both the summary and the tables are generated from the same run, so they cannot drift apart.
        </li>
      </ul>
    </section>
  );
}

function Reproduce() {
  return (
    <section className="mt-16 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">Reproduce it</h2>
      <p className="mb-4 text-zinc-600 dark:text-zinc-400">
        The three apps and the harness are in the repository. One spec file says what each app must do, and the payload runner asserts it — a route
        that stopped rendering the same thing fails the check rather than quietly reporting a smaller number.
      </p>
      <pre className="mb-4 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <code>{'pnpm --filter @rshono/benchmarks setup:apps\npnpm --filter @rshono/benchmarks bench'}</code>
      </pre>
      <p className="text-zinc-600 dark:text-zinc-400">
        <a href={BENCH_URL} data-native>
          packages/benchmarks
        </a>{' '}
        has the method, the full caveat list, and what it deliberately does not measure. For the non-numeric differences, see{' '}
        <a href="/comparison" data-prefetch>
          how rshono compares
        </a>
        .
      </p>
    </section>
  );
}
