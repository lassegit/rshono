import * as prompts from '@clack/prompts';
import { basename, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { hasGit, initRepo, isInsideRepo } from './git.js';
import {
  DEPLOY_TARGET_NAMES,
  QUALITY_PRESETS,
  isValidPackageName,
  toPackageName,
  type Answers,
  type DeployTargetName,
  type Formatter,
  type Linter,
  type PackageManagerName,
  type QualityPreset,
  type Styling,
} from './options.js';
import { plan as buildPlan } from './plan.js';
import { detectPackageManager, packageManager, runInstall, runScript } from './pm.js';
import { nextSteps, summary, unwrap } from './ui.js';
import { inspectTarget, writePlan } from './write.js';

const DEFAULT_DIRECTORY = 'my-rshono-app';

const HELP = `create-rshono — scaffold a new rshono app

Usage:
  npm create @rshono@latest [directory] [options]

Options:
  -y, --yes                accept the default for every question not given as a flag
  -d, --deploy <target>    ${DEPLOY_TARGET_NAMES.join(' | ')}
      --tailwind           Tailwind CSS (--no-tailwind for plain CSS)
      --quality <preset>   ${QUALITY_PRESETS.map((preset) => preset.id).join(' | ')}
      --formatter <name>   prettier | biome | oxfmt | none      (overrides --quality)
      --linter <name>      oxlint | eslint | biome | none       (overrides --quality; eslint pins TypeScript 6)
      --pm <name>          npm | pnpm | yarn | bun              (default: whatever ran this)
      --no-install         write the files and stop
      --no-git             do not initialize a repository
      --force              scaffold into a directory that is not empty
      --dry-run            list the files that would be written, and write nothing
  -h, --help               show this help
  -v, --version            print the version

Every question can be answered by a flag, and a non-interactive terminal implies --yes — so one command
scaffolds without prompting:

  npm create @rshono@latest my-app -y --deploy cloudflare --tailwind --quality biome
`;

function fail(message: string): never {
  prompts.log.error(message);
  process.exit(1);
}

/** A flag's value, checked against what the option accepts — a typo should not become a silent default. */
function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], flag: string): T | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) fail(`--${flag} must be one of: ${allowed.join(', ')} (got "${value}")`);
  return value as T;
}

/** `--x` / `--no-x` pairs, since `parseArgs` has no notion of a negatable boolean. */
function tristate(on: boolean | undefined, off: boolean | undefined, flag: string): boolean | undefined {
  if (on && off) fail(`--${flag} and --no-${flag} contradict each other.`);
  if (on) return true;
  if (off) return false;
  return undefined;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      yes: { type: 'boolean', short: 'y' },
      deploy: { type: 'string', short: 'd' },
      tailwind: { type: 'boolean' },
      'no-tailwind': { type: 'boolean' },
      quality: { type: 'string' },
      formatter: { type: 'string' },
      linter: { type: 'string' },
      pm: { type: 'string' },
      install: { type: 'boolean' },
      'no-install': { type: 'boolean' },
      git: { type: 'boolean' },
      'no-git': { type: 'boolean' },
      force: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    allowPositionals: true,
  });

  if (values.help) return console.log(HELP);
  if (values.version) return console.log(__CREATE_RSHONO_VERSION__);

  // A pipe, a CI job or an agent gets the defaults rather than a prompt nothing can answer.
  const interactive = Boolean(process.stdout.isTTY) && !values.yes;

  const pmFlag = oneOf(values.pm, ['npm', 'pnpm', 'yarn', 'bun'] as const, 'pm');
  const pm = pmFlag ? packageManager(pmFlag) : detectPackageManager();

  const deployFlag = oneOf(values.deploy, DEPLOY_TARGET_NAMES as DeployTargetName[], 'deploy');
  const formatterFlag = oneOf(values.formatter, ['prettier', 'biome', 'oxfmt', 'none'] as const, 'formatter');
  const linterFlag = oneOf(values.linter, ['oxlint', 'eslint', 'biome', 'none'] as const, 'linter');
  const qualityFlag = oneOf(
    values.quality,
    QUALITY_PRESETS.map((preset) => preset.id),
    'quality',
  );
  const tailwindFlag = tristate(values.tailwind, values['no-tailwind'], 'tailwind');
  const installFlag = tristate(values.install, values['no-install'], 'install');
  const gitFlag = tristate(values.git, values['no-git'], 'git');

  prompts.intro(`create-rshono  ·  rshono ${__CREATE_RSHONO_VERSION__}`);

  // ── Where ───────────────────────────────────────────────────────────────────────────────────────
  let directory = positionals[0];
  if (!directory) {
    directory = interactive
      ? unwrap(
          await prompts.text({
            message: 'Where should the app go?',
            placeholder: DEFAULT_DIRECTORY,
            defaultValue: DEFAULT_DIRECTORY,
            validate: (value) => (toPackageName(value || DEFAULT_DIRECTORY) ? undefined : 'That leaves nothing usable as a package name.'),
          }),
        )
      : DEFAULT_DIRECTORY;
  }

  const targetDir = resolve(process.cwd(), directory);
  const packageName = toPackageName(directory === '.' ? basename(targetDir) : directory);
  if (!packageName || !isValidPackageName(packageName)) fail(`"${directory}" does not give a usable npm package name.`);

  const conflicts = inspectTarget(targetDir).conflicts;
  if (conflicts.length > 0 && !values.force) {
    const where = directory === '.' ? 'this directory' : `"${directory}"`;
    const listed = `${conflicts.slice(0, 3).join(', ')}${conflicts.length > 3 ? ', …' : ''}`;
    if (!interactive) fail(`${where} is not empty (${listed}) — pass --force to scaffold into it anyway.`);

    const proceed = unwrap(await prompts.confirm({ message: `${where} is not empty (${listed}). Write into it anyway?`, initialValue: false }));
    if (!proceed) {
      prompts.cancel('Nothing was written.');
      process.exit(0);
    }
  }

  // ── What ────────────────────────────────────────────────────────────────────────────────────────
  let deploy: DeployTargetName = deployFlag ?? 'node';
  if (!deployFlag && interactive) {
    deploy = unwrap(
      await prompts.select({
        message: 'Where will it be deployed?',
        initialValue: deploy,
        options: DEPLOY_TARGET_NAMES.map((name) => ({ value: name, label: name })),
      }),
    );
  }

  let styling: Styling = tailwindFlag === undefined ? 'css' : tailwindFlag ? 'tailwind' : 'css';
  if (tailwindFlag === undefined && interactive) {
    styling = unwrap(
      await prompts.select({
        message: 'Styling?',
        initialValue: styling,
        options: [
          { value: 'css' as Styling, label: 'Plain CSS', hint: 'compiled natively, no PostCSS' },
          { value: 'tailwind' as Styling, label: 'Tailwind CSS', hint: 'adds postcss.config.mjs' },
        ],
      }),
    );
  }

  /*
   * The preset asks one question instead of two. The two axes stay independent underneath — a
   * `--formatter` or `--linter` flag addresses either on its own, and skips the question entirely.
   */
  let preset: QualityPreset | undefined = QUALITY_PRESETS.find((candidate) => candidate.id === qualityFlag);
  if (!preset && !formatterFlag && !linterFlag) {
    const fallback = QUALITY_PRESETS[0]!;
    if (interactive) {
      const id = unwrap(
        await prompts.select({
          message: 'Formatting and linting?',
          initialValue: fallback.id,
          options: QUALITY_PRESETS.map((option) => ({ value: option.id, label: option.label, hint: option.hint })),
        }),
      );
      preset = QUALITY_PRESETS.find((candidate) => candidate.id === id);
    } else {
      preset = fallback;
    }
  }

  const formatter: Formatter = formatterFlag ?? preset?.formatter ?? 'none';
  const linter: Linter = linterFlag ?? preset?.linter ?? 'none';

  // ── How ─────────────────────────────────────────────────────────────────────────────────────────
  let install = installFlag ?? true;
  if (installFlag === undefined && interactive) {
    install = unwrap(await prompts.confirm({ message: `Install dependencies with ${pm.name}?`, initialValue: true }));
  }

  let git = gitFlag ?? !isInsideRepo(process.cwd());
  if (gitFlag === undefined && interactive) {
    const nested = isInsideRepo(process.cwd());
    git = unwrap(
      await prompts.confirm({
        message: nested ? 'Initialize a git repository? (this is already inside one)' : 'Initialize a git repository?',
        initialValue: !nested,
      }),
    );
  }

  const answers: Answers = {
    packageName,
    targetDir,
    deploy,
    styling,
    formatter,
    linter,
    packageManager: pm.name as PackageManagerName,
    install,
    git,
  };

  // ── Plan, then write ────────────────────────────────────────────────────────────────────────────
  const plan = buildPlan(answers, pm);

  if (values['dry-run']) {
    prompts.note([...plan.files.keys()].join('\n'), `${plan.files.size} files — ${summary(answers)}`);
    prompts.outro('Dry run: nothing was written.');
    return;
  }

  writePlan(plan, targetDir);
  prompts.log.success(`Created ${plan.files.size} files in ${relative(process.cwd(), targetDir) || '.'}  ·  ${summary(answers)}`);

  let installed = false;
  if (install) {
    prompts.log.step(`Installing dependencies with ${pm.name}…`);
    installed = runInstall(pm, targetDir);
    if (!installed) prompts.log.warn(`${pm.name} install failed — run it yourself and the rest will work.`);
  }

  /*
   * Format the scaffold with the tool it was scaffolded with, so a fresh project passes its own
   * `format:check` instead of reporting a diff nobody made. Needs the install, since the formatter is a
   * devDependency — hence the skip, rather than a failure, when there is none.
   */
  if (installed && formatter !== 'none') {
    if (!runScript(pm, 'format', targetDir)) prompts.log.warn(`\`${pm.run} format\` failed — the files are fine, the formatter is not.`);
  }

  if (git) {
    if (!hasGit(targetDir)) {
      prompts.log.warn('git was not found on PATH — skipped.');
    } else {
      const result = initRepo(targetDir);
      if (result === 'initialized') prompts.log.warn('Repository initialized, but the first commit failed — set git user.name and user.email.');
      if (result === 'failed') prompts.log.warn('git init failed — skipped.');
    }
  }

  prompts.note(nextSteps(answers, plan, pm, { directory, installed }), 'Next');
  prompts.outro('Happy building.');
}

main().catch((error) => {
  prompts.log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
