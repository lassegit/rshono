import type { DeployTargetName } from '../options.js';
import { TOOL_VERSIONS } from '../versions.js';
import type { Feature } from './types.js';

/**
 * What a deploy target adds beyond the `deploy` line in `rshono.config.ts`, which the template carries.
 *
 * Deliberately thin: the framework arranges its own output for every platform, and `rshono build`
 * writes the one platform config that has to exist (`wrangler.jsonc`, dated the day it ran) if the
 * project has none — a second copy generated here would only go stale. So a target contributes the
 * command that ships the build, the CLI that command needs, the directories to gitignore, and a note
 * for the step no command covers. Several contribute just one of those.
 */
const DEPLOY_FEATURES: Record<DeployTargetName, Feature> = {
  // Where a Node build goes from here is a Dockerfile or a process manager, neither of which this can
  // guess — so the target contributes only the command that runs what was built.
  node: {
    id: 'deploy-node',
    scripts: { start: 'rshono start' },
  },
  cloudflare: {
    id: 'deploy-cloudflare',
    devDependencies: { wrangler: TOOL_VERSIONS.wrangler },
    // The only two install scripts a scaffolded app can end up with, and wrangler brings both. Each
    // one merely picks the platform binary out of the optional dependency that already carries it, so
    // neither needs to run — `workerd --version` and `esbuild --version` both answer without it.
    allowBuilds: { esbuild: false, workerd: false },
    scripts: { deploy: 'rshono build && wrangler deploy' },
    gitignore: ['.wrangler/'],
    notes: ['The first build writes wrangler.jsonc — yours to edit after that.'],
  },
  vercel: {
    id: 'deploy-vercel',
    scripts: { deploy: 'rshono build && vercel deploy --prebuilt' },
    gitignore: ['.vercel/'],
    notes: ['--prebuilt uploads what rshono build assembled; the platform must not rebuild it.'],
  },
  'aws-lambda': {
    id: 'deploy-aws-lambda',
    notes: ['Use a Function URL in RESPONSE_STREAM mode — a buffered invoke mode drops the streaming.'],
  },
};

export function deployFeature(target: DeployTargetName): Feature {
  return DEPLOY_FEATURES[target];
}
