export function median(xs) {
  return percentile(xs, 50);
}

export function percentile(xs, p) {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  // Linear interpolation between order statistics — the usual definition, and it stops p99 on a
  // 200-sample run from just being "the second largest value".
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function stdev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Relative spread of the trials. Printed alongside every timing so a reader can see when a
 * difference is inside the noise — which on a laptop it usually is.
 */
export function rsd(xs) {
  const m = mean(xs);
  const s = stdev(xs);
  return m && s !== null ? (s / m) * 100 : null;
}

/**
 * `Math.min(...xs)` spreads every sample onto the call stack, and a fast route over an 8s run puts
 * hundreds of thousands of latencies in here — enough to overflow it. Loop instead.
 */
function extent(xs) {
  if (!xs.length) return { min: null, max: null };
  let min = xs[0];
  let max = xs[0];
  for (const x of xs) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return { min, max };
}

export function summarize(xs) {
  const { min, max } = extent(xs);
  return {
    n: xs.length,
    min,
    p50: percentile(xs, 50),
    p90: percentile(xs, 90),
    p99: percentile(xs, 99),
    max,
    mean: mean(xs),
    stdev: stdev(xs),
    rsdPct: rsd(xs),
  };
}

export function ms(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}s`;
  if (v >= 1000) return `${(v / 1000).toFixed(2)}s`;
  return `${v.toFixed(v < 10 ? 2 : 0)}ms`;
}

export function bytes(v) {
  if (v === null || v === undefined) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} kB`;
  return `${(v / (1024 * 1024)).toFixed(2)} MB`;
}

export function num(v, digits = 0) {
  return v === null || v === undefined ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: digits });
}
