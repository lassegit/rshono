/**
 * SSR Renderer — Node implementation.
 *
 * Renders a React tree to a Web ReadableStream using React 19's
 * renderToPipeableStream (streaming SSR with Suspense). See render.ts
 * for the contract; ssr-web.ts is the runtime-portable twin used by
 * edge server bundles.
 */
import { Readable, Transform } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import type { StreamRenderOptions } from './render.js';

export function renderToStream(options: StreamRenderOptions): Promise<ReadableStream<Uint8Array>> {
    const { element, bootstrapScript, bootstrapModules, onError, onMissingDocument, timeoutMs = 10_000 } = options;

    return new Promise((resolve, reject) => {
        let timer: NodeJS.Timeout | undefined;

        const { pipe, abort } = renderToPipeableStream(element, {
            bootstrapScriptContent: bootstrapScript,
            bootstrapModules,

            onShellReady() {
                // Node's own Writable→web-stream conversion handles
                // backpressure, close and error propagation (an aborted
                // render errors the response instead of leaving it hanging).
                // The Transform's only job is to inspect the first chunk.
                let firstChunk = true;
                const pass = new Transform({
                    transform(chunk: Buffer, _encoding, callback) {
                        if (firstChunk) {
                            firstChunk = false;
                            // React emits <!DOCTYPE html> as the first bytes
                            // whenever the tree renders <html>.
                            if (onMissingDocument && !/^<!doctype/i.test(chunk.toString('utf8', 0, 15))) {
                                onMissingDocument();
                            }
                        }
                        callback(null, chunk);
                    },
                });
                // 'close' fires when the client cancels (toWeb destroys the
                // stream) and after a normal end — abort() is a no-op once
                // the render has completed, so no finished-flag is needed.
                pass.on('close', () => {
                    clearTimeout(timer);
                    abort(new Error('Response stream cancelled by client'));
                });
                pipe(pass);
                resolve(Readable.toWeb(pass) as ReadableStream<Uint8Array>);
            },

            onShellError(error) {
                clearTimeout(timer);
                reject(error);
            },

            onAllReady() {
                clearTimeout(timer);
            },

            onError(error) {
                onError?.(error);
            },
        });

        // Never leave a request hanging on a Suspense boundary that won't resolve.
        timer = setTimeout(() => abort(new Error(`SSR render timed out after ${timeoutMs}ms`)), timeoutMs);
    });
}
