/**
 * Handler for the /api/hello endpoint — SERVER-ONLY.
 *
 * Endpoint handlers live in *.server.ts modules (exported as `handler`),
 * so their code never reaches the browser: the bundler replaces every
 * *.server module with a throwing stub in the client bundle.
 */
import type { Handler } from "rs-hono";

export const handler: Handler = (c) => {
  return c.json({
    message: "Hello from rs-hono!",
    timestamp: Date.now(),
  });
};
