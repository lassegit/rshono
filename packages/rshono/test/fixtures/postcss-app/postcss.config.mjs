// The plugin list, found by postcss-loader — which the `rspack` hook in rshono.config.ts is what puts
// in front of the CSS parser in the first place.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
