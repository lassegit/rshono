// Test fixture: opts in to X-Forwarded-*, which is off by default, baked into the build via
// `rshono build --config`. Plain object (defineConfig is just an identity helper) so it needs no
// module resolution.
//
// The only security setting left in rshono.config.ts, and so the only one that still needs a build
// of its own to test: it is resolved before Rspack compiles and baked into the server bundle. The
// CSRF check, the CSP and the body cap are Hono middleware in the testbed's src/server.ts, switched
// by environment against this same build.
export default {
  trustProxy: true,
};
