// The generator, over the whole matrix of answers, in memory. `plan()` does no I/O beyond reading the
// templates, so every combination the CLI can produce is asserted here in milliseconds — which is the
// point of the plan/write split. What a real install and build make of the result is `e2e.test.mjs`.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  DEPLOY_TARGET_NAMES,
  FRAMEWORK_DEPS,
  QUALITY_PRESETS,
  RSHONO_RANGE,
  detectPackageManager,
  isValidPackageName,
  packageManager,
  plan,
  selectFeatures,
  toPackageName,
} from '../dist/api.mjs';

const PACKAGE_DIR = join(fileURLToPath(import.meta.url), '..', '..');
const TEMPLATES_DIR = join(PACKAGE_DIR, 'templates');
const pm = packageManager('pnpm', '11.9.0');

/** The answers a `--yes` run produces, with whatever the case under test overrides. */
function answers(overrides = {}) {
  return {
    packageName: 'my-app',
    targetDir: '/tmp/my-app',
    deploy: 'node',
    styling: 'css',
    formatter: 'prettier',
    linter: 'oxlint',
    packageManager: 'pnpm',
    install: false,
    git: false,
    ...overrides,
  };
}

/** Every combination the prompts can produce: 7 targets × 2 stylings × 4 presets. */
function* matrix() {
  for (const deploy of DEPLOY_TARGET_NAMES) {
    for (const styling of ['css', 'tailwind']) {
      for (const preset of QUALITY_PRESETS) {
        yield { deploy, styling, formatter: preset.formatter, linter: preset.linter, preset: preset.id };
      }
    }
  }
}

const REQUIRED = ['package.json', 'tsconfig.json', 'rshono.config.ts', '.gitignore', '.env', 'README.md', 'src/routes.ts', 'src/components/home.tsx'];

test('every combination produces a complete, parseable project', () => {
  for (const combination of matrix()) {
    const label = `${combination.deploy}/${combination.styling}/${combination.preset}`;
    const result = plan(answers(combination), pm);

    for (const path of REQUIRED) {
      assert.ok(result.files.has(path), `${label} is missing ${path}`);
    }

    const manifest = JSON.parse(result.files.get('package.json'));
    assert.equal(manifest.name, 'my-app', label);
    assert.equal(manifest.private, true, label);
    assert.equal(manifest.type, 'module', label);
    assert.equal(manifest.dependencies['@rshono/core'], RSHONO_RANGE, label);
    assert.ok(manifest.scripts.dev && manifest.scripts.build && manifest.scripts.typecheck, `${label} is missing a base script`);

    // A stray `__TOKEN__` in any file means a template referenced something `tokensFor` does not supply.
    for (const [path, contents] of result.files) {
      assert.doesNotMatch(contents, /__[A-Z][A-Z\d_]*__/, `${label}: unsubstituted token in ${path}`);
    }
  }
});

test('the plan is deterministic — same answers, byte-identical files', () => {
  const first = plan(answers({ deploy: 'cloudflare', styling: 'tailwind' }), pm);
  const second = plan(answers({ deploy: 'cloudflare', styling: 'tailwind' }), pm);
  assert.deepEqual([...first.files.entries()], [...second.files.entries()]);
});

test('the deploy target reaches the config, the scripts and the README', () => {
  for (const deploy of DEPLOY_TARGET_NAMES) {
    const result = plan(answers({ deploy }), pm);
    assert.match(result.files.get('rshono.config.ts'), new RegExp(`deploy: '${deploy}'`), deploy);
    assert.match(result.files.get('README.md'), new RegExp(`built for \`${deploy}\``), deploy);
  }
});

test('only the Node-shaped targets get a start script, and each gets its own runtime', () => {
  const start = (deploy) => JSON.parse(plan(answers({ deploy }), pm).files.get('package.json')).scripts.start;
  assert.equal(start('node'), 'rshono start');
  assert.equal(start('bun'), 'bun dist/server/main.mjs');
  assert.equal(start('deno'), 'deno serve -A dist/server/main.mjs');
  // `rshono start` refuses a build made for another platform, so offering it here would be a broken script.
  for (const deploy of ['cloudflare', 'vercel', 'netlify', 'aws-lambda']) {
    assert.equal(start(deploy), undefined, deploy);
  }
});

test('Tailwind brings its own PostCSS pass — the framework has none', () => {
  const plain = plan(answers({ styling: 'css' }), pm);
  const tailwind = plan(answers({ styling: 'tailwind' }), pm);

  assert.ok(!plain.files.has('postcss.config.mjs'));
  assert.ok(tailwind.files.has('postcss.config.mjs'));
  assert.match(tailwind.files.get('src/styles.css'), /@import 'tailwindcss'/);

  // The rule in the `rspack` hook is what puts postcss-loader in front of Rspack's native CSS parser.
  assert.doesNotMatch(plain.files.get('rshono.config.ts'), /postcss-loader/);
  assert.match(tailwind.files.get('rshono.config.ts'), /rules!\.push\(\{ test: \/\\\.css\$\/i, use: \['postcss-loader'\], type: 'css\/auto' \}\)/);

  // Including the loader itself: rshono does not depend on postcss, so the app has to.
  const dev = JSON.parse(tailwind.files.get('package.json')).devDependencies;
  for (const name of ['tailwindcss', '@tailwindcss/postcss', 'postcss', 'postcss-loader']) {
    assert.ok(dev[name], `Tailwind needs ${name}`);
  }
  assert.ok(!JSON.parse(plain.files.get('package.json')).devDependencies.postcss, 'a plain-CSS app should install none of it');
});

test('the two rshono.config.ts variants document the same options', () => {
  // The Tailwind variant is a copy with a `rspack` hook in it, so the commented options are the thing
  // that can drift. Every setting the base config names has to be named there too.
  const base = plan(answers({ styling: 'css' }), pm).files.get('rshono.config.ts');
  const tailwind = plan(answers({ styling: 'tailwind' }), pm).files.get('rshono.config.ts');

  const settings = [...base.matchAll(/^\s*\/\/ (\w+):/gm)].map((match) => match[1]);
  assert.ok(settings.length >= 8, 'the base config should document the framework settings');
  for (const setting of settings) {
    assert.match(tailwind, new RegExp(`// ${setting}:`), `the Tailwind config has drifted — it no longer documents ${setting}`);
  }
});

test('Biome answers both slots once, and steps around Tailwind CSS when both are chosen', () => {
  const biome = plan(answers({ formatter: 'biome', linter: 'biome' }), pm);
  const manifest = JSON.parse(biome.files.get('package.json'));
  assert.equal(Object.keys(manifest.devDependencies).filter((name) => name.includes('biome')).length, 1);
  assert.ok(manifest.scripts.format && manifest.scripts.lint, 'Biome should contribute both');
  assert.ok(!biome.files.has('.prettierrc.json'));

  // Biome's CSS parser rejects `@apply`, so the two together need stylesheets left out.
  assert.doesNotMatch(biome.files.get('biome.json'), /\*\.css/);
  const withTailwind = plan(answers({ formatter: 'biome', linter: 'biome', styling: 'tailwind' }), pm);
  assert.match(withTailwind.files.get('biome.json'), /!\*\*\/\*\.css/);
});

test('each quality preset brings its own config files and no other tool', () => {
  const configs = {
    'prettier-oxlint': ['.prettierrc.json', '.oxlintrc.json'],
    biome: ['biome.json'],
    oxc: ['.oxfmtrc.json', '.oxlintrc.json'],
    none: [],
  };
  const all = new Set(Object.values(configs).flat());

  for (const preset of QUALITY_PRESETS) {
    const result = plan(answers({ formatter: preset.formatter, linter: preset.linter }), pm);
    for (const path of all) {
      const expected = configs[preset.id].includes(path);
      assert.equal(result.files.has(path), expected, `${preset.id} ${expected ? 'is missing' : 'should not ship'} ${path}`);
    }
  }
});

test('"none" leaves the app without a formatter, a linter, or scripts for either', () => {
  const manifest = JSON.parse(plan(answers({ formatter: 'none', linter: 'none' }), pm).files.get('package.json'));
  assert.deepEqual(Object.keys(manifest.scripts), ['dev', 'build', 'typecheck', 'start']);
  assert.deepEqual(Object.keys(manifest.devDependencies), ['@types/node', '@types/react', 'typescript']);
});

test('a feature contributing gitignore lines gets them, under a heading naming it', () => {
  const gitignore = plan(answers({ deploy: 'cloudflare' }), pm).files.get('.gitignore');
  assert.match(gitignore, /# deploy-cloudflare\n\.wrangler\//);
  assert.doesNotMatch(plan(answers({ deploy: 'node' }), pm).files.get('.gitignore'), /wrangler/);
});

test('every overlay a feature names exists on disk', () => {
  for (const combination of matrix()) {
    for (const feature of selectFeatures(answers(combination))) {
      for (const overlay of feature.overlays ?? []) {
        assert.ok(existsSync(join(TEMPLATES_DIR, overlay)), `${feature.id} names a missing overlay: templates/${overlay}`);
      }
    }
  }
});

test('the React pins are the ones the framework is tested against, not a copy that can drift', () => {
  const framework = JSON.parse(readFileSync(join(PACKAGE_DIR, '..', 'rshono', 'package.json'), 'utf8'));
  for (const [name, range] of Object.entries(FRAMEWORK_DEPS)) {
    assert.equal(range, framework.devDependencies[name], `${name} has drifted from packages/rshono — run \`pnpm --filter @rshono/create codegen\``);
  }
  // Exact, not caret: rshono's RSC internals are coupled across builds, and a generated app has no
  // workspace overrides to keep a single copy of React.
  assert.match(FRAMEWORK_DEPS.react, /^\d+\.\d+\.\d+$/);
  assert.match(FRAMEWORK_DEPS['react-dom'], /^\d+\.\d+\.\d+$/);
});

test('packageManager is written only when the environment gave an exact version', () => {
  const withVersion = JSON.parse(plan(answers(), packageManager('pnpm', '11.9.0')).files.get('package.json'));
  assert.equal(withVersion.packageManager, 'pnpm@11.9.0');
  const without = JSON.parse(plan(answers(), packageManager('npm')).files.get('package.json'));
  assert.ok(!('packageManager' in without), 'a guessed version is worse than no field');
});

test('the package manager is read off npm_config_user_agent', () => {
  assert.deepEqual(detectPackageManager('pnpm/11.9.0 npm/? node/v22.14.0 darwin arm64'), {
    name: 'pnpm',
    version: '11.9.0',
    install: ['install'],
    run: 'pnpm',
  });
  assert.equal(detectPackageManager('bun/1.2.0 npm/? node/v22.0.0').name, 'bun');
  assert.equal(detectPackageManager('yarn/4.1.0').run, 'yarn');
  // Empty, not `undefined`: omitting the argument is what reads the real environment, so passing
  // `undefined` here would assert against whichever package manager happens to be running the tests.
  assert.equal(detectPackageManager('').name, 'npm', 'a bare `node bin/create-rshono.mjs` is an npm project');
  assert.equal(detectPackageManager('some-other-tool/1.0.0').name, 'npm', 'an unknown agent is not a package manager we can drive');
  assert.equal(detectPackageManager('pnpm/latest').version, undefined, 'a non-version is not a version');
});

test('a directory name becomes a package name npm will accept', () => {
  assert.equal(toPackageName('My App'), 'my-app');
  assert.equal(toPackageName('./nested/my-app'), 'my-app');
  assert.equal(toPackageName('my-app/'), 'my-app');
  assert.equal(toPackageName('@scope/pkg'), '@scope/pkg');
  assert.equal(toPackageName('  Spaced Out  '), 'spaced-out');
  assert.equal(toPackageName(''), null);
  assert.equal(toPackageName('///'), null);

  assert.ok(isValidPackageName('my-app'));
  assert.ok(isValidPackageName('@scope/pkg'));
  assert.ok(!isValidPackageName('My-App'));
  assert.ok(!isValidPackageName('.hidden'));
});
