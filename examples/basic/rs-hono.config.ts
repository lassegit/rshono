import { defineConfig } from "rs-hono/config";

export default defineConfig({
  outDir: "dist",
  publicDir: "public",
  dev: {
    port: 3000,
  },
});
