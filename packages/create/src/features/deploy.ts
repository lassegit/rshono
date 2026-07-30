import type { DeployTargetName } from '../options.js';
import { TOOL_VERSIONS } from '../versions.js';
import type { Feature } from './types.js';

/**
 * What a deploy target adds beyond the `deploy` line in `rshono.config.ts` — which is the build's job
 * to read, and the template's to carry.
 *
 * Deliberately thin. The framework already knows how to arrange its own output for every platform, and
 * `rshono build` writes the one platform config that has to exist (`wrangler.jsonc`, with the
 * `compatibility_date` of the day it ran) if the project has none. Generating a second copy here would
 * be a copy that goes stale.
 *
 * So a target contributes only what is true of it: the command that runs or ships the build, the CLI
 * that command needs installed locally, the directories its platform leaves behind for `.gitignore`, and
 * a note for the step no command covers. Several contribute just one of those.
 */
const DEPLOY_FEATURES: Record<DeployTargetName, Feature> = {
  // Where a Node build goes from here is a Dockerfile or a process manager, neither of which this can
  // guess — so the target contributes only the command that runs what was built.
  node: {
    id: 'deploy-node',
    scripts: { start: 'rshono start' },
  },
  // `rshono start` is the Node target's launcher and refuses a build made for another platform, so
  // these two get the command their own runtime uses under the same script name.
  bun: {
    id: 'deploy-bun',
    scripts: { start: 'bun dist/server/main.mjs' },
  },
  deno: {
    id: 'deploy-deno',
    scripts: { start: 'deno serve -A dist/server/main.mjs' },
  },
  cloudflare: {
    id: 'deploy-cloudflare',
    devDependencies: { wrangler: TOOL_VERSIONS.wrangler },
    // wrangler brings workerd, whose install script only picks the platform binary out of the optional
    // dependency that already carries it — `workerd --version` answers without it having run.
    allowBuilds: { workerd: false },
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
  netlify: {
    id: 'deploy-netlify',
    scripts: { deploy: 'rshono build && netlify deploy --build=false --dir=.netlify/publish' },
    gitignore: ['.netlify/'],
  },
  'aws-lambda': {
    id: 'deploy-aws-lambda',
    notes: ['Use a Function URL in RESPONSE_STREAM mode — a buffered invoke mode drops the streaming.'],
  },
};

export function deployFeature(target: DeployTargetName): Feature {
  return DEPLOY_FEATURES[target];
}
