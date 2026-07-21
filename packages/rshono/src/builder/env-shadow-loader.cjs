'use strict';
const OPENS_WITH_USE_SERVER = /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(['"])use server\1\s*(?:;|\n|$)/;
const DIRECTIVE_PROLOGUE = /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(?:(['"])use [a-z -]+\1\s*;?)?/;

module.exports = function envShadowLoader(source) {
  if (!source.includes('process.env')) return source;
  if (OPENS_WITH_USE_SERVER.test(source)) return source;
  const { prelude } = this.getOptions();
  const prologue = source.match(DIRECTIVE_PROLOGUE)[0];
  return prologue + prelude + source.slice(prologue.length);
};
