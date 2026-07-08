import { defineConfig } from "rs-hono/config";

export default defineConfig({
  framework: "react",
  outDir: "dist",
  publicDir: "public",
  dev: {
    port: 3000,
  },
});
