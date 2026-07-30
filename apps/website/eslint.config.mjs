import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Flat config, with type-aware rules — the reason to run ESLint over a syntax-only linter. `projectService`
 * builds the same program `tsc` does from tsconfig.json, so a rule can ask what a value actually *is*:
 * an unawaited promise, a `catch` that swallows an error, a `String()` around something that is not one.
 *
 * The cost is that ESLint needs TypeScript to answer, which is why this app pins TypeScript 6 —
 * typescript-eslint reads the compiler API directly and accepts nothing newer. `npm run typecheck` is
 * still the thing that decides whether the app compiles; these rules only see what it sees.
 */
export default tseslint.config(
  // ESLint's own default ignores cover node_modules and nothing else, so the build output — and whatever
  // the deploy target leaves beside it — would otherwise be linted as if you had written it.
  { ignores: ['dist/**', '.wrangler/**', '.vercel/**', '.netlify/**'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  // The rules of hooks: the one class of React mistake no type checker catches, and the reason a React
  // app wants a linter at all.
  reactHooks.configs.flat['recommended-latest'],
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  // This file and any other plain JavaScript sits outside the TypeScript program, so the type-aware rules
  // have nothing to run against and would report every file as unconfigured.
  { files: ['**/*.{js,mjs,cjs}'], extends: [tseslint.configs.disableTypeChecked] },
);
