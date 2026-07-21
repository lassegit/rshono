'use strict';
const OPENS_WITH_DIRECTIVE = /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(['"])use (?:client|server|server-entry)\1\s*(?:;|\n|$)/;

module.exports = function pageEntryLoader(source) {
  if (OPENS_WITH_DIRECTIVE.test(source)) return source;
  return "'use server-entry';" + source;
};
