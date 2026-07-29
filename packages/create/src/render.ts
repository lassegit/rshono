import { deployHint, type Answers } from './options.js';
import type { PackageManager } from './pm.js';

/**
 * The substitutions applied to every template file. Deliberately a handful of scalars: anything that
 * needs a *branch* is a separate file in an overlay, so template files stay valid TypeScript, CSS and
 * JSON that an editor can check and a formatter can format.
 */
export type Tokens = Record<string, string>;

const TOKEN_PATTERN = /__[A-Z][A-Z\d_]*__/g;

export function tokensFor(answers: Answers, pm: PackageManager): Tokens {
  return {
    __PROJECT_NAME__: answers.packageName,
    __DEPLOY_TARGET__: answers.deploy,
    __DEPLOY_HINT__: deployHint(answers.deploy),
    __PM__: pm.name,
    __PM_RUN__: pm.run,
  };
}

/**
 * Substitutes tokens, and throws on one it doesn't know — a typo in a template would otherwise ship a
 * literal `__PORJECT_NAME__` into somebody's new app, which no test of the generator's logic would
 * catch.
 */
export function render(contents: string, tokens: Tokens, source: string): string {
  return contents.replace(TOKEN_PATTERN, (token) => {
    const value = tokens[token];
    if (value === undefined) throw new Error(`[create-rshono] ${source} uses unknown template token ${token}`);
    return value;
  });
}
