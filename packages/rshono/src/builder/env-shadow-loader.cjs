'use strict';
const DIRECTIVE_PROLOGUE = /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(?:(['"])use [a-z -]+\1\s*;?)?/;

module.exports = function envShadowLoader(source) {
  if (!source.includes('process.env')) return source;
  const { prelude, layer } = this.getOptions();
  if (this._module?.layer !== layer) return source;
  const prologue = source.match(DIRECTIVE_PROLOGUE)[0];
  return prologue + prelude + source.slice(prologue.length);
};
