// Rspack's native CSS is the whole CSS pipeline here, and it parses *finished* CSS — so an app using
// Tailwind (or any other PostCSS plugin) puts the loader in front of that parser itself, through the
// `rspack` hook in rshono.config.ts. The framework has no PostCSS in it and no dependency on any; this
// fixture is the check that the documented four lines actually work, end to end: from an
// `@import "tailwindcss"` nobody could resolve to compiled utilities in the stylesheet the page links.
//
// The apps with no PostCSS at all are the rest of the suite.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { buildApp, POSTCSS_APP_DIR, startApp, stopServer } from './helpers.mjs';

buildApp(POSTCSS_APP_DIR);

const chunksDir = join(POSTCSS_APP_DIR, 'dist', 'static', 'chunks');
const cssFiles = readdirSync(chunksDir).filter((file) => file.endsWith('.css'));
const css = cssFiles.map((file) => readFileSync(join(chunksDir, file), 'utf8')).join('\n');

const { base, child } = await startApp(POSTCSS_APP_DIR, 'start');
after(() => stopServer(child));

test('a rule added through the rspack hook puts PostCSS in front of the CSS parser', () => {
  assert.equal(cssFiles.length, 1, 'the page imports one stylesheet, so one CSS chunk should be emitted');
  assert.doesNotMatch(css, /@import[^;]*tailwindcss/, 'an unexpanded @import means PostCSS never ran');
  assert.match(css, /\.font-bold\{/, 'a utility used by the page should be compiled into the stylesheet');
  assert.match(css, /\.bg-slate-50\{/);
});

test('the plugin sees the fixture config, not just its defaults', () => {
  // `--color-fixture` exists only in the fixture's own `@theme` block.
  assert.match(css, /--color-fixture:/, 'the @theme block should reach the emitted CSS');
  assert.match(css, /\.text-fixture\{color:var\(--color-fixture\)\}/, 'and generate a utility for the custom token');
});

test('class detection is scoped to the fixture rather than dumping every utility', () => {
  assert.doesNotMatch(css, /\.text-7xl\{/, 'no page uses text-7xl, so emitting it would mean the @source scan was ignored');
});

test('the compiled stylesheet is the one the page links', async () => {
  const html = await (await fetch(`${base}/`)).text();
  const href = html.match(/<link rel="stylesheet" href="([^"]+)"/)?.[1];
  assert.ok(href, 'the page should link a stylesheet');
  assert.equal(href, `/_static/chunks/${cssFiles[0]}`, 'and it should be the file PostCSS produced');

  const served = await fetch(`${base}${href}`);
  assert.equal(served.status, 200);
  assert.match(await served.text(), /\.font-bold\{/, 'the served bytes should be the compiled CSS');
});
