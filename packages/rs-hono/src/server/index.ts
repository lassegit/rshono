/**
 * rs-hono/server — server-only internals.
 *
 * Kept separate from the "rs-hono" root export so that routes.ts (which
 * is part of the client bundle) never drags react-dom/server or Node
 * built-ins into the browser graph.
 */

export { buildApp, type BuildAppOptions } from "./app.js";
export { createAppHandler } from "./handler.js";
export { renderToStream } from "../renderer/ssr.js";
