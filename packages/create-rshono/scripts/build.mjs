// Rspack through its Node API rather than `@rspack/cli`, which is a dependency this package would carry
// only to parse a config file it already has in hand.
import { rspack } from '@rspack/core';
import config from '../rspack.config.mjs';

const stats = await new Promise((resolve, reject) => {
  rspack(config, (error, stats) => (error ? reject(error) : resolve(stats)));
});

const { errors, warnings } = stats.toJson({ errors: true, warnings: true, all: false });
for (const warning of warnings ?? []) console.warn(`  ⚠ ${warning.message}`);
if (errors?.length) {
  for (const error of errors) console.error(`  ✗ ${error.message}`);
  process.exit(1);
}

const { assets } = stats.toJson({ assets: true, all: false });
for (const asset of assets ?? []) console.log(`  • bundled dist/${asset.name} (${(asset.size / 1024).toFixed(0)} kB)`);
