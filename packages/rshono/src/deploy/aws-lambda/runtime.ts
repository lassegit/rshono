import type { Hono } from 'hono';
import { streamHandle } from 'hono/aws-lambda';
import type { DeployRuntime } from '../contract.js';
import { fileSystemRuntime } from '../filesystem.js';

/**
 * AWS Lambda behind a Function URL, in streaming mode.
 *
 * `streamHandle` wraps the app with `awslambda.streamifyResponse`, which is the only way a Lambda can
 * write a response progressively — and progressive is the whole point of a streamed SSR shell. It
 * requires the Function URL's invoke mode to be `RESPONSE_STREAM`; the buffered `handle` would work
 * anywhere but would hold every page until the last byte rendered.
 *
 * The filesystem capabilities are Node's: a Lambda unpacks the deployment package onto a read-only
 * disk, so `dist/static`, `dist/public` and `dist/ssg` are read exactly as they are on a server.
 */
export const runtime: DeployRuntime = {
  ...fileSystemRuntime,

  serveApp(app: Hono): unknown {
    // `awslambda` is a global the Lambda runtime injects, so it is absent when the build imports this
    // bundle to prerender. Returning nothing then keeps that pass working; a real invocation has it.
    if (typeof (globalThis as { awslambda?: unknown }).awslambda === 'undefined') return undefined;
    return streamHandle(app);
  },
};
