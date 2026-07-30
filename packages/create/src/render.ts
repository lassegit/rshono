import { deployHint, type Answers } from './options.js';
import type { PackageManager } from './pm.js';

/**
 * The substitutions applied to every template file. Deliberately a handful of scalars: anything that
 * needs a *branch* is a separate file in an overlay, so template files stay valid TypeScript, CSS and
 * JSON that an editor can check and a formatter can format.
 */
export type Tokens = Record<string, string>;

/**
 * `{{NAME}}`, and not the `__NAME__` this used to be. A template is a real file that real tools run
 * over, and in markdown `__NAME__` *is* strong emphasis — Prettier rewrites it to `**NAME**`, which
 * turns a token into literal text that no substitution will ever match again. `{{…}}` means nothing to
 * any of the formats these templates are written in.
 */
const TOKEN_PATTERN = /\{\{[A-Z][A-Z\d_]*\}\}/g;

export function tokensFor(answers: Answers, pm: PackageManager): Tokens {
  return {
    '{{PROJECT_NAME}}': answers.packageName,
    '{{DEPLOY_TARGET}}': answers.deploy,
    '{{DEPLOY_HINT}}': deployHint(answers.deploy),
    '{{PM_RUN}}': pm.run,
  };
}

/**
 * Substitutes tokens, and throws on one it doesn't know — a typo in a template would otherwise ship a
 * literal `{{PORJECT_NAME}}` into somebody's new app, which no test of the generator's logic would
 * catch.
 */
export function render(contents: string, tokens: Tokens, source: string): string {
  return contents.replace(TOKEN_PATTERN, (token) => {
    const value = tokens[token];
    if (value === undefined) throw new Error(`[create-rshono] ${source} uses unknown template token ${token}`);
    return value;
  });
}
