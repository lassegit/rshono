// Test fixture: a security-hardened config, baked into the build via `rshono build --config`.
// Plain object (defineConfig is just an identity helper) so it needs no module resolution.
export default {
  csp: true,
  checkOrigin: true,
  allowedOrigins: ['https://admin.example'],
  bodySizeLimit: 1024,
};
