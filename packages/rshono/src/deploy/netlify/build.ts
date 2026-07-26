import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DeployBuildContext } from '../presets.js';

/**
 * What Netlify uploads: a publish directory the CDN serves, and an internal function directory the
 * platform picks handlers up from without the project needing a `netlify/functions` folder of its own.
 */
const PUBLISH_DIR = join('.netlify', 'publish');
const FUNCTIONS_DIR = join('.netlify', 'functions-internal');
const FUNCTION_NAME = 'rshono-server';

/**
 * The function entry Netlify loads. It re-exports the built bundle's default handler and, next to it,
 * the v2 `config` that claims every path — so routing is declared in code rather than in a redirect
 * rule the project would have to maintain.
 *
 * `preferStatic` is what keeps the CDN in front: a path that exists in the publish directory is served
 * from there and the function is never invoked.
 */
const FUNCTION_ENTRY = `export { default } from '../../dist/server/main.mjs';

export const config = {
  path: '/*',
  preferStatic: true,
};
`;

/**
 * `dist/server/main.mjs` is kept at that exact path inside the function bundle because the runtime
 * derives the project root from where it sits (see `deploy/filesystem.ts`), which is what puts
 * `dist/ssg` within reach at request time.
 */
export async function finalizeNetlifyBuild(ctx: DeployBuildContext): Promise<void> {
  const publishDir = join(ctx.rootDir, PUBLISH_DIR);
  const functionsDir = join(ctx.rootDir, FUNCTIONS_DIR);

  // Rebuilt from scratch, so a deleted page or asset cannot survive in the uploaded output.
  await rm(publishDir, { recursive: true, force: true });
  await rm(functionsDir, { recursive: true, force: true });
  mkdirSync(publishDir, { recursive: true });
  mkdirSync(functionsDir, { recursive: true });

  cpSync(ctx.staticDir, join(publishDir, '_static'), { recursive: true });
  if (ctx.publicDir) cpSync(ctx.publicDir, publishDir, { recursive: true });
  // The one header the CDN cannot infer; everything else keeps Netlify's defaults.
  writeFileSync(join(publishDir, '_headers'), '/_static/*\n  Cache-Control: public, max-age=31536000, immutable\n');

  cpSync(join(ctx.distDir, 'server'), join(functionsDir, 'dist', 'server'), { recursive: true });
  if (existsSync(ctx.ssgDir)) cpSync(ctx.ssgDir, join(functionsDir, 'dist', 'ssg'), { recursive: true });
  if (ctx.publicDir) cpSync(ctx.publicDir, join(functionsDir, 'dist', 'public'), { recursive: true });
  writeFileSync(join(functionsDir, `${FUNCTION_NAME}.mjs`), FUNCTION_ENTRY);

  console.log(`  • assembled ${PUBLISH_DIR} and ${FUNCTIONS_DIR}`);
}
