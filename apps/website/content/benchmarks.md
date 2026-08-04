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

| Metric        | rshono    | Next.js   | TanStack Start |
| ------------- | --------- | --------- | -------------- |
| Cold build    | 436ms ±6% | 3.11s ±6% | 3.32s ±20%     |
| Warm rebuild  | 409ms ±1% | 3.17s ±7% | 3.28s ±4%      |
| Build output  | 1.21 MB   | 5.92 MB   | 1.57 MB        |
| Output files  | 14        | 198       | 30             |
| Server bundle | 989.2 kB  | —         | 804.3 kB       |

## Cold start

Process spawn to first answered request, fresh process each trial. Not a real serverless cold start — no container, no network — it isolates the JavaScript the framework has to parse and run before it can respond.

| Metric                 | rshono    | Next.js   | TanStack Start |
| ---------------------- | --------- | --------- | -------------- |
| Spawn → first response | 267ms ±1% | 343ms ±2% | 577ms ±5%      |
| Server bundle          | 989.2 kB  | —         | 804.3 kB       |

## Throughput

32 connections, 8s per route after a 2s warmup, driven by the harness's own Node load generator.

**Read this as a floor check, not a headline.** All three render through the same React and stream through the same react-dom, so a large gap would mean an HTTP layer is pathological rather than that one framework renders faster. The in-process driver is identically handicapping for all three, and its absolute rps is a lower bound. `/api/health` is the informative row: no React on the path, so it is router and response construction alone.

All three put React server components on the request path for `/ssr` and `/interactive` (APP_SPEC.md rule 8), so those two rows compare implementations of one architecture. They are not a perfect match: rshono and Next encode and decode the whole document, TanStack Start only the route body its RSC helpers wrap — its shell and nav stay on the cheaper non-RSC path. The flight round trip dominates both rows; on `/ssr` it is roughly 85% of the request.

### `/`

| Metric       | rshono | Next.js | TanStack Start |
| ------------ | ------ | ------- | -------------- |
| Requests/sec | 33,883 | 6,516   | 5,362          |
| p50          | 0.81ms | 4.55ms  | 5.91ms         |
| p99          | 1.90ms | 9.59ms  | 12ms           |
| Errors       | 0      | 0       | 0              |

### `/ssr`

| Metric       | rshono | Next.js | TanStack Start |
| ------------ | ------ | ------- | -------------- |
| Requests/sec | 340    | 324     | 279            |
| p50          | 91ms   | 96ms    | 111ms          |
| p99          | 182ms  | 153ms   | 223ms          |
| Errors       | 0      | 0       | 0              |

### `/interactive`

| Metric       | rshono | Next.js | TanStack Start |
| ------------ | ------ | ------- | -------------- |
| Requests/sec | 1,431  | 702     | 992            |
| p50          | 21ms   | 45ms    | 31ms           |
| p99          | 43ms   | 63ms    | 62ms           |
| Errors       | 0      | 0       | 0              |

### `/api/health`

| Metric       | rshono | Next.js | TanStack Start |
| ------------ | ------ | ------- | -------------- |
| Requests/sec | 29,195 | 4,751   | 13,599         |
| p50          | 0.94ms | 6.65ms  | 2.07ms         |
| p99          | 2.70ms | 13ms    | 5.18ms         |
| Errors       | 0      | 0       | 0              |

### Memory

Resident memory of the whole process tree, and of the single largest process in it — which is the server itself in all three. The tree total carries whatever `npm run start` left running and double-counts pages the processes share, so the **server** row is the one to compare.

| Metric                  | rshono              | Next.js             | TanStack Start      |
| ----------------------- | ------------------- | ------------------- | ------------------- |
| RSS idle — tree         | 200.20 MB (3 procs) | 157.55 MB (2 procs) | 246.61 MB (3 procs) |
| RSS idle — server       | 72.70 MB            | 92.88 MB            | 164.14 MB           |
| RSS after load — tree   | 897.52 MB (3 procs) | 408.92 MB (2 procs) | 482.89 MB (3 procs) |
| RSS after load — server | 764.45 MB           | 347.34 MB           | 403.36 MB           |
| Requests served         | 518,927             | 98,441              | 161,984             |
| Growth per 1k requests  | 1.33 MB             | 2.58 MB             | 1.48 MB             |

## Dev server startup

`dev` command to a served `/interactive` — which every one of these compiles lazily, so it includes compiling a route with three client components rather than just binding a socket. Cold clears the dev cache first.

HMR round-trip is the other number worth having here and is not measured: it needs a browser driving the page to assert the patch arrived.

| Metric         | rshono    | Next.js    | TanStack Start |
| -------------- | --------- | ---------- | -------------- |
| Cold dev start | 528ms ±8% | 1.86s ±18% | 2.54s ±12%     |
| Warm dev start | 520ms ±1% | 1.71s ±15% | 2.37s ±3%      |

## Footprint

A production-only install (`--omit=dev`) into a throwaway directory, and the application code the spec took to express.

| Metric              | rshono   | Next.js   | TanStack Start |
| ------------------- | -------- | --------- | -------------- |
| Prod install size   | 72.82 MB | 291.09 MB | 57.47 MB       |
| Packages installed  | 16       | 22        | 101            |
| Direct dependencies | 4        | 3         | 4              |
| App source files    | 16       | 16        | 18             |
| App source lines    | 462      | 458       | 670            |
