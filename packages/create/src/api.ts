/**
 * The generator without the CLI around it: answers in, the exact set of files out. This is what the
 * test suite asserts on — the whole matrix of options, in memory, with no directory to clean up — and
 * what another tool would call to scaffold an app itself.
 *
 * @packageDocumentation
 */

export { selectFeatures, type Feature } from './features/index.js';
export {
  DEPLOY_TARGET_NAMES,
  PACKAGE_MANAGERS,
  QUALITY_PRESETS,
  deployHint,
  isDeployTarget,
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
export { buildPackageJson } from './pkg.js';
export { plan, type Plan } from './plan.js';
export { detectPackageManager, packageManager, type PackageManager } from './pm.js';
export { ESLINT_TYPESCRIPT, FRAMEWORK_DEPS, RSHONO_RANGE, TOOL_VERSIONS } from './versions.js';
export { inspectTarget, writePlan, type TargetState } from './write.js';
