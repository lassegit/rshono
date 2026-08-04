---
title: Benchmarks
description: One app built three ways — rshono, Next.js and TanStack Start — measured on payload bytes, build time, cold start and install size.
---

_Generated from `packages/benchmarks` on 2026-08-04 (build, payload, coldstart, load, devstart). One run, one machine. Regenerate with
`pnpm --filter @rshono/benchmarks bench` and `pnpm --filter @rshono/benchmarks site:publish`._

## Environment

| Property | Value                                                  |
| -------- | ------------------------------------------------------ |
| Machine  | Apple M1 · 8 cores · 16 GB                             |
| Platform | darwin 25.5.0 arm64                                    |
| Node     | v22.22.2                                               |
| CI       | no — laptop numbers, treat spreads under ~10% as noise |

### Versions

React version skew across the three is unavoidable — Next vendors its own copy — so it is reported rather than hidden. A render-path difference of a few percent is more likely this than the framework.

| Package                   | rshono     | Next.js | TanStack Start |
| ------------------------- | ---------- | ------- | -------------- |
| `react`                   | 19.2.8     | 19.2.8  | 19.2.8         |
| `react-dom`               | 19.2.8     | 19.2.8  | 19.2.8         |
| `@rshono/core`            | 1.0.0-rc.3 | —       | —              |
| `hono`                    | 4.12.32    | —       | —              |
| `@rspack/core`            | 2.1.5      | —       | —              |
| `react-server-dom-rspack` | 0.0.2      | —       | —              |
| `next`                    | —          | 16.2.12 | —              |
| `@tanstack/react-start`   | —          | —       | 1.168.33       |
| `@tanstack/react-router`  | —          | —       | 1.170.18       |
| `vite`                    | —          | —       | 7.3.6          |

## Initial-load payload

Brotli-compressed bytes the browser is committed to fetching before the route is interactive: the document, the inline flight payload, and every statically referenced script and stylesheet. Compression is applied by the harness, identically for all three.

### `/` — prerendered

| Metric              | rshono           | Next.js            | TanStack Start    |
| ------------------- | ---------------- | ------------------ | ----------------- |
| Document (br)       | 855 B            | 1.7 kB             | 1.1 kB            |
| Inline script (raw) | 2.3 kB           | 5.7 kB             | 1.3 kB            |
| External JS (br)    | 58.7 kB · 1 file | 160.0 kB · 9 files | 97.2 kB · 2 files |
| CSS (br)            | 657 B · 1        | 615 B · 1          | 611 B · 1         |
| **Total (br)**      | **60.2 kB**      | **162.3 kB**       | **98.8 kB**       |
| Total (raw)         | 223.0 kB         | 627.8 kB           | 356.6 kB          |
| Requests            | 3                | 11                 | 4                 |
| Spec checks         | ✓                | ✓                  | ✓                 |

### `/ssr` — dynamic

| Metric              | rshono           | Next.js            | TanStack Start    |
| ------------------- | ---------------- | ------------------ | ----------------- |
| Document (br)       | 4.3 kB           | 5.2 kB             | 5.3 kB            |
| Inline script (raw) | 35.1 kB          | 38.9 kB            | 37.4 kB           |
| External JS (br)    | 58.7 kB · 1 file | 160.0 kB · 9 files | 97.0 kB · 2 files |
| CSS (br)            | 657 B · 1        | 615 B · 1          | 611 B · 1         |
| **Total (br)**      | **63.7 kB**      | **165.8 kB**       | **102.9 kB**      |
| Total (raw)         | 268.2 kB         | 673.4 kB           | 404.3 kB          |
| Requests            | 3                | 11                 | 4                 |
| Spec checks         | ✓                | ✓                  | ✓                 |

### `/interactive` — dynamic

| Metric              | rshono            | Next.js             | TanStack Start    |
| ------------------- | ----------------- | ------------------- | ----------------- |
| Document (br)       | 2.8 kB            | 3.7 kB              | 3.8 kB            |
| Inline script (raw) | 13.4 kB           | 17.6 kB             | 15.7 kB           |
| External JS (br)    | 59.8 kB · 4 files | 160.9 kB · 10 files | 98.5 kB · 4 files |
| CSS (br)            | 657 B · 1         | 615 B · 1           | 611 B · 1         |
| **Total (br)**      | **63.3 kB**       | **165.2 kB**        | **102.9 kB**      |
| Total (raw)         | 239.1 kB          | 644.7 kB            | 376.6 kB          |
| Requests            | 6                 | 12                  | 6                 |
| Spec checks         | ✓                 | ✓                   | ✓                 |

### `/api/health` — json

| Metric              | rshono        | Next.js       | TanStack Start |
| ------------------- | ------------- | ------------- | -------------- |
| Document (br)       | 32 B          | 32 B          | 32 B           |
| Inline script (raw) | 0 B           | 0 B           | 0 B            |
| External JS (br)    | 0 B · 0 files | 0 B · 0 files | 0 B · 0 files  |
| CSS (br)            | 0 B · 0       | 0 B · 0       | 0 B · 0        |
| **Total (br)**      | **32 B**      | **32 B**      | **32 B**       |
| Total (raw)         | 28 B          | 28 B          | 28 B           |
| Requests            | 1             | 1             | 1              |
| Spec checks         | ✓             | ✓             | ✓              |

## Build

Median of 3 trials. Cold clears the framework's cache directory first; warm keeps it and touches one source file the interactive route imports.

| Metric        | rshono     | Next.js   | TanStack Start |
| ------------- | ---------- | --------- | -------------- |
| Cold build    | 411ms ±20% | 3.02s ±8% | 3.10s ±5%      |
| Warm rebuild  | 416ms ±2%  | 3.04s ±1% | 3.03s ±0%      |
| Build output  | 1.21 MB    | 5.92 MB   | 1.57 MB        |
| Output files  | 14         | 198       | 30             |
| Server bundle | 986.9 kB   | —         | 804.3 kB       |

## Cold start

Process spawn to first answered request, fresh process each trial. Not a real serverless cold start — no container, no network — it isolates the JavaScript the framework has to parse and run before it can respond.

| Metric                 | rshono    | Next.js   | TanStack Start |
| ---------------------- | --------- | --------- | -------------- |
| Spawn → first response | 267ms ±1% | 332ms ±0% | 529ms ±1%      |
| Server bundle          | 986.9 kB  | —         | 804.3 kB       |

## Throughput

32 connections, 8s per route after a 2s warmup, driven by the harness's own Node load generator.

**Read this as a floor check, not a headline.** All three render through the same React and stream through the same react-dom, so a large gap would mean an HTTP layer is pathological rather than that one framework renders faster. The in-process driver is identically handicapping for all three, and its absolute rps is a lower bound. `/api/health` is the informative row: no React on the path, so it is router and response construction alone.

All three put React server components on the request path for `/ssr` and `/interactive` (APP_SPEC.md rule 8), so those two rows compare implementations of one architecture. They are not a perfect match: rshono and Next encode and decode the whole document, TanStack Start only the route body its RSC helpers wrap — its shell and nav stay on the cheaper non-RSC path. The flight round trip dominates both rows; on `/ssr` it is roughly 85% of the request.

### `/`

| Metric       | rshono | Next.js | TanStack Start |
| ------------ | ------ | ------- | -------------- |
| Requests/sec | 33,788 | 6,161   | 4,869          |
| p50          | 0.83ms | 4.85ms  | 6.25ms         |
| p99          | 1.78ms | 11ms    | 14ms           |
| Errors       | 0      | 0       | 0              |

### `/ssr`

| Metric       | rshono | Next.js | TanStack Start |
| ------------ | ------ | ------- | -------------- |
| Requests/sec | 336    | 331     | 252            |
| p50          | 90ms   | 94ms    | 121ms          |
| p99          | 193ms  | 124ms   | 250ms          |
| Errors       | 0      | 0       | 0              |

### `/interactive`

| Metric       | rshono | Next.js | TanStack Start |
| ------------ | ------ | ------- | -------------- |
| Requests/sec | 1,307  | 701     | 868            |
| p50          | 23ms   | 45ms    | 34ms           |
| p99          | 49ms   | 65ms    | 78ms           |
| Errors       | 0      | 0       | 0              |

### `/api/health`

| Metric       | rshono | Next.js | TanStack Start |
| ------------ | ------ | ------- | -------------- |
| Requests/sec | 24,636 | 4,331   | 11,858         |
| p50          | 0.95ms | 6.91ms  | 2.26ms         |
| p99          | 4.87ms | 16ms    | 6.52ms         |
| Errors       | 0      | 0       | 0              |

### Memory

Resident memory of the whole process tree, and of the single largest process in it — which is the server itself in all three. The tree total carries whatever `npm run start` left running and double-counts pages the processes share, so the **server** row is the one to compare.

| Metric                  | rshono               | Next.js             | TanStack Start      |
| ----------------------- | -------------------- | ------------------- | ------------------- |
| RSS idle — tree         | 200.44 MB (3 procs)  | 158.89 MB (2 procs) | 245.03 MB (3 procs) |
| RSS idle — server       | 72.86 MB             | 94.23 MB            | 162.47 MB           |
| RSS after load — tree   | 1357.48 MB (3 procs) | 383.88 MB (2 procs) | 480.92 MB (3 procs) |
| RSS after load — server | 1229.02 MB           | 322.44 MB           | 401.39 MB           |
| Requests served         | 480,636              | 92,328              | 143,158             |
| Growth per 1k requests  | 2.41 MB              | 2.47 MB             | 1.67 MB             |

## Dev server startup

`dev` command to a served `/interactive` — which every one of these compiles lazily, so it includes compiling a route with three client components rather than just binding a socket. Cold clears the dev cache first.

HMR round-trip is the other number worth having here and is not measured: it needs a browser driving the page to assert the patch arrived.

| Metric         | rshono    | Next.js    | TanStack Start |
| -------------- | --------- | ---------- | -------------- |
| Cold dev start | 505ms ±9% | 1.92s ±7%  | 2.56s ±5%      |
| Warm dev start | 509ms ±4% | 1.98s ±15% | 2.24s ±5%      |

## Footprint

A production-only install (`--omit=dev`) into a throwaway directory, and the application code the spec took to express.

| Metric              | rshono   | Next.js   | TanStack Start |
| ------------------- | -------- | --------- | -------------- |
| Prod install size   | 72.82 MB | 291.09 MB | 57.47 MB       |
| Packages installed  | 16       | 22        | 101            |
| Direct dependencies | 4        | 3         | 4              |
| App source files    | 16       | 16        | 18             |
| App source lines    | 462      | 458       | 670            |
