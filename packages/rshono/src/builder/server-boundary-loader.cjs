'use strict';
const OPENS_WITH_USE_SERVER = /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(['"])use server\1\s*(?:;|\n|$)/;

module.exports = function serverBoundaryLoader(source) {
  if (OPENS_WITH_USE_SERVER.test(source)) return source;
  throw new Error(
    `[rshono] "${this.resourcePath}" is a *.server module, but it is imported from client code ` +
      "(a 'use client' component or something it imports). Server-only modules cannot ship to the browser. " +
      'Fix: do the server work in a server component and pass the result down as props — or, if this module ' +
      "is meant to define server actions, put 'use server' at the top so it compiles to server references.",
  );
};
