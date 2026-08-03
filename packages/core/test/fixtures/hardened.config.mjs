// Test fixture: a security-hardened config, baked into the build via `rshono build --config`.
// Plain object (defineConfig is just an identity helper) so it needs no module resolution.
export default {
  csp: true,
  // Widens one directive and relaxes another, to prove overrides merge over the built-in policy
  // without dropping the per-request nonce.
  cspDirectives: {
    'img-src': "'self' https://images.example",
    'frame-ancestors': "'self'",
  },
  checkOrigin: true,
  // The second entry is a bare host *with a port* — the form that needs a base to parse, and that
  // used to normalize to an empty string and so silently never match.
  allowedOrigins: ['https://admin.example', 'alt.example:8443'],
  bodySizeLimit: 1024,
  // Opts in to X-Forwarded-*, which is off by default. The default build asserts those headers are
  // ignored; this one asserts they're honoured once a proxy has been declared.
  trustProxy: true,
};
