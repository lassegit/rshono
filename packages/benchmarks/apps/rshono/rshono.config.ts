import { defineConfig } from '@rshono/core';

export default defineConfig({
  deploy: 'node',
  siteUrl: 'https://bench.rshono.example',
  // APP_SPEC.md rule 4: the harness compresses every target's bytes itself, identically. An app-level
  // compressor here would mean three different gzip settings feeding one comparison table.
  compress: false,
});
