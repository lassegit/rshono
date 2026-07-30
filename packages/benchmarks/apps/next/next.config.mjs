/** @type {import('next').NextConfig} */
const nextConfig = {
  // APP_SPEC.md rule 4: the harness compresses every target's bytes itself, identically.
  compress: false,
  poweredByHeader: false,
};

export default nextConfig;
