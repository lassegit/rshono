#!/usr/bin/env node
// Thin launcher, kept deliberately old-syntax and dependency-free: it is the one file that has to
// parse and run on whatever Node the user happens to have. The CLI itself is a bundle — its imports
// are evaluated before any statement in it, so a version check *inside* it would be too late to
// produce anything friendlier than a stack trace.
var MINIMUM = [22, 1, 0];

var current = process.versions.node.split('.').map(Number);
var older = false;
for (var i = 0; i < MINIMUM.length; i++) {
  if (current[i] === MINIMUM[i]) continue;
  older = current[i] < MINIMUM[i];
  break;
}

if (older) {
  console.error(
    '\ncreate-rshono needs Node ' +
      MINIMUM.join('.') +
      ' or newer — you are on ' +
      process.versions.node +
      '.\n' +
      'rshono itself requires it too (worker threads, process.loadEnvFile, Promise.withResolvers),\n' +
      'so scaffolding on this version would produce an app that cannot start.\n',
  );
  process.exit(1);
}

import('../dist/cli.mjs');
