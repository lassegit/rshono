/**
 * The headline metric: what does a route cost the browser?
 *
 * Per route, per target: the document, the inline script bytes (the flight payload is in here), and
 * every JS/CSS asset the document commits to loading. Compression is applied here — gzip 9 and
 * brotli 11, identically for all three — rather than trusted to each app's own compressor.
 */
import { resolveTargets, ROUTES, hasFlag } from './lib/targets.mjs';
import { indent, startServer } from './lib/proc.mjs';
import { sizes } from './lib/sizes.mjs';
import { parseDocument, textContent, detectDevBuild } from './lib/document.mjs';
import { bytes } from './lib/stats.mjs';
import { merge } from './lib/results.mjs';

const targets = resolveTargets();
const strict = hasFlag('strict');

const out = {};
let specViolations = 0;

for (const target of targets) {
  console.log(`\n=== ${target.label} ===`);
  let server;
  try {
    server = await startServer(target);
  } catch (error) {
    out[target.id] = { label: target.label, error: error.message };
    // Whole message, not just its first line: `startServer` appends the server's own output, and that
    // is where the reason lives — most often "no production build found", which is what `setup:apps`
    // deliberately leaves behind until the app is rebuilt.
    console.log(indent(error.message));
    continue;
  }

  const routes = {};
  try {
    for (const route of ROUTES) {
      routes[route.id] = await measureRoute(server.base, route, target);
      const r = routes[route.id];
      if (r.error) {
        console.log(`  ${route.path.padEnd(14)} ✗ ${r.error}`);
        specViolations += 1;
        continue;
      }
      const failed = r.checks.filter((c) => !c.found).map((c) => c.text);
      if (failed.length) specViolations += 1;
      console.log(
        `  ${route.path.padEnd(14)} doc ${bytes(r.document.raw).padStart(9)}` +
          `  inline-js ${bytes(r.inlineScriptBytes).padStart(9)}` +
          `  ext-js ${bytes(r.js.raw).padStart(9)}` +
          `  css ${bytes(r.css.raw).padStart(8)}` +
          `  total-br ${bytes(r.total.brotli).padStart(9)}` +
          `  reqs ${String(r.requests).padStart(3)}` +
          (failed.length ? `  ⚠ missing: ${failed.join(', ')}` : ''),
      );
    }
  } finally {
    await server.stop();
  }

  out[target.id] = { label: target.label, routes };
}

async function measureRoute(base, route, target) {
  const res = await fetch(base + route.path, {
    headers: { accept: route.kind === 'json' ? 'application/json' : 'text/html', 'accept-encoding': 'identity' },
  });
  const body = Buffer.from(await res.arrayBuffer());
  if (!res.ok) return { error: `HTTP ${res.status}`, status: res.status };

  const document = sizes(body);
  const checks = route.checks.map((text) => ({ text, found: false }));

  if (route.kind === 'json') {
    const text = body.toString('utf8');
    for (const c of checks) c.found = text.includes(c.text);
    return {
      status: res.status,
      contentType: res.headers.get('content-type'),
      document,
      inlineScriptBytes: 0,
      inlineScripts: 0,
      js: { raw: 0, gzip: 0, brotli: 0, count: 0 },
      css: { raw: 0, gzip: 0, brotli: 0, count: 0 },
      other: { raw: 0, count: 0 },
      total: document,
      requests: 1,
      checks,
      assets: [],
    };
  }

  const html = body.toString('utf8');
  const devMarkers = detectDevBuild(html);
  if (devMarkers.length) return { error: `dev build served (${devMarkers.join(', ')}) — run the build first`, status: res.status };

  const text = textContent(html);
  for (const c of checks) c.found = text.includes(c.text);

  const parsed = parseDocument(html);
  const assets = [];
  const acc = {
    script: { raw: 0, gzip: 0, brotli: 0, count: 0 },
    style: { raw: 0, gzip: 0, brotli: 0, count: 0 },
    other: { raw: 0, count: 0 },
  };

  for (const ref of parsed.external) {
    const url = new URL(ref.url, base);
    // Cross-origin assets are out of spec (rule 7) — record and skip rather than silently include
    // a third party's bytes in a framework's score.
    if (url.origin !== new URL(base).origin) {
      assets.push({ url: ref.url, as: ref.as, hint: ref.hint, skipped: 'cross-origin' });
      continue;
    }
    const assetRes = await fetch(url, { headers: { 'accept-encoding': 'identity' } });
    const buf = Buffer.from(await assetRes.arrayBuffer());
    const s = sizes(buf);
    const bucket = assetRes.ok ? (acc[ref.as] ?? acc.other) : acc.other;
    bucket.raw += s.raw;
    bucket.count += 1;
    if (bucket.gzip !== undefined) {
      bucket.gzip += s.gzip;
      bucket.brotli += s.brotli;
    }
    assets.push({
      url: url.pathname,
      as: ref.as,
      hint: ref.hint,
      status: assetRes.status,
      ...s,
      framework: target.clientAssetPrefix ? url.pathname.startsWith(target.clientAssetPrefix) : null,
    });
  }

  const total = {
    raw: document.raw + acc.script.raw + acc.style.raw + acc.other.raw,
    gzip: document.gzip + acc.script.gzip + acc.style.gzip,
    brotli: document.brotli + acc.script.brotli + acc.style.brotli,
  };

  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    cacheControl: res.headers.get('cache-control'),
    document,
    inlineScriptBytes: parsed.inlineScriptBytes,
    inlineScripts: parsed.inlineScripts,
    inlineStyleBytes: parsed.inlineStyleBytes,
    js: acc.script,
    css: acc.style,
    other: acc.other,
    total,
    requests: 1 + assets.filter((a) => !a.skipped).length,
    checks,
    assets,
  };
}

await merge('payload', out);
console.log('\nwrote results/latest.json → sections.payload');

if (specViolations) {
  console.log(`\n⚠ ${specViolations} route(s) failed a spec check — the apps are not rendering the same thing.`);
  if (strict) process.exit(1);
}
