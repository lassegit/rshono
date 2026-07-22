'use strict';
// Client components are server-rendered in the RSC "ssr" layer. Their code (and any
// transitive helper compiled into that layer) must see the SAME public env the browser
// bundle sees — the client bundle's DefinePlugin already guarantees that — otherwise a
// secret read during SSR leaks into the HTML and desyncs hydration.
//
// A module's role is its *layer*, not its first line: gate the shadow on the ssr layer,
// not on a `'use client'` directive. Server components stay in the rsc layer and keep
// real `process.env`. A helper imported by both is compiled once per layer, so it gets
// the real env in the rsc copy and the shadowed env in the ssr copy — automatically.
const DIRECTIVE_PROLOGUE = /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(?:(['"])use [a-z -]+\1\s*;?)?/;

module.exports = function envShadowLoader(source) {
  if (!source.includes('process.env')) return source;
  const { prelude, layer } = this.getOptions();
  if (this._module?.layer !== layer) return source;
  const prologue = source.match(DIRECTIVE_PROLOGUE)[0];
  return prologue + prelude + source.slice(prologue.length);
};
