import { defineConfig } from 'rs-hono/config';

export default defineConfig({
    outDir: 'dist',
    publicDir: 'public',
    dev: { port: 3000 },

    // Escape hatch into the client bundle's Rspack config: mutate (or
    // return) anything — loaders, plugins, aliases. `rspack` is the
    // framework's own instance, so builtin plugins need no extra install.
    // Verify: curl -s localhost:3000/_static/chunks/main.js | head -1
    rspack: (config, { rspack, dev }) => {
        config.plugins.push(
            new rspack.BannerPlugin({
                banner: `rs-hono example (${dev ? 'dev' : 'production'} build)`,
                entryOnly: true,
            }),
        );
    },
});
