/**
 * The plugin list. postcss-loader finds this file on its own; what puts postcss-loader in front of
 * Rspack's CSS parser in the first place is the rule in `rshono.config.ts`.
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
