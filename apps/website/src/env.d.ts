// Importing a stylesheet is a build-time concern the compiler knows nothing about on its own.
declare module '*.css';

/** Markdown is bundled as a string by the `asset/source` rule in `rshono.config.ts`. */
declare module '*.md' {
  const source: string;
  export default source;
}
