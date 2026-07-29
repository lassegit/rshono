import { defineConfig } from 'rshono';

/**
 * The documented way to put a PostCSS pass in front of Rspack's native CSS parser — the whole of what
 * Tailwind needs from the build, and the reason the framework itself has no PostCSS dependency.
 *
 * The hook runs once per compiler, so pushing the rule here reaches both the client and the server
 * graph. `postcss-loader` is resolved against the *project*, which is where it and `postcss` are
 * installed.
 */
export default defineConfig({
  rspack(config) {
    config.module!.rules!.push({ test: /\.css$/i, use: ['postcss-loader'], type: 'css/auto' });
  },
});
