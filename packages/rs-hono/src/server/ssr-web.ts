/**
 * SSR Renderer — Web Streams implementation.
 *
 * The runtime-portable twin of ssr.ts, built on React's
 * renderToReadableStream (react-dom/server.edge): no node:stream, no
 * process — runs on Cloudflare Workers, Deno, Bun and Node alike. It is
 * what `rs-hono build --target edge` bundles; the Node CLI keeps ssr.ts
 * because React recommends the pipeable API on Node for throughput.
 *
 * Same contract (render.ts): resolves when the shell is ready, rejects
 * on a shell error, onError fires for non-fatal Suspense errors.
 */
import { renderToReadableStream } from 'react-dom/server.edge';
import type { StreamRenderOptions } from './render.js';

const decoder = new TextDecoder();

export async function renderToStream(options: StreamRenderOptions): Promise<ReadableStream<Uint8Array>> {
    const { element, bootstrapScript, bootstrapModules, onError, onMissingDocument, timeoutMs = 10_000 } = options;

    // Rejects on shell error. The signal also rejects a shell still
    // pending at the deadline, and aborts Suspense boundaries that are
    // still streaming after it — never leaves a request hanging.
    const stream = await renderToReadableStream(element, {
        bootstrapScriptContent: bootstrapScript,
        bootstrapModules,
        signal: AbortSignal.timeout(timeoutMs),
        onError(error: unknown) {
            onError?.(error);
        },
    });

    if (!onMissingDocument) return stream;

    let firstChunk = true;
    return stream.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                if (firstChunk) {
                    firstChunk = false;
                    // React emits <!DOCTYPE html> as the first bytes
                    // whenever the tree renders <html>.
                    if (!/^<!doctype/i.test(decoder.decode(chunk.subarray(0, 15)))) {
                        onMissingDocument();
                    }
                }
                controller.enqueue(chunk);
            },
        }),
    );
}
