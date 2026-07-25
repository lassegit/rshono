// Test fixture: a malformed `allowedOrigins` entry. Resolving the config is what rejects it, and
// that happens before Rspack compiles anything, so `rshono build` fails fast rather than shipping a
// bundle whose allowlist silently matches nothing.
export default {
  allowedOrigins: ['://not-a-host'],
};
