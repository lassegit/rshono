/**
 * SSR Renderer
 *
 * Renders a React tree to a Web ReadableStream using React 18/19's
 * renderToPipeableStream (streaming SSR with Suspense).
 *
 * The returned promise resolves when the SHELL is ready — so the caller
 * can attach the correct HTTP status — and rejects on a shell error
 * (the caller responds with a real 500 instead of a 200 that contains
 * an error page).
 */
import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";
import type { ReactNode } from "react";

const encoder = new TextEncoder();

interface StreamRenderOptions {
  /** The React element to render */
  element: ReactNode;
  /**
   * Inline script injected before hydration.
   * Typically sets window.__RSH. MUST already be safely escaped.
   */
  bootstrapScript?: string;
  /** URL of the client entry module (for the hydration script tag). */
  clientEntry?: string;
  /** Called for non-fatal errors inside Suspense boundaries. */
  onError?: (error: unknown) => void;
  /** Abort a render that is still pending after this many ms. */
  timeoutMs?: number;
}

export function renderToStream(
  options: StreamRenderOptions
): Promise<ReadableStream<Uint8Array>> {
  const { element, bootstrapScript, clientEntry, onError, timeoutMs = 10_000 } = options;

  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;

    const { pipe, abort } = renderToPipeableStream(element, {
      bootstrapScriptContent: bootstrapScript,
      bootstrapModules: clientEntry ? [clientEntry] : undefined,

      onShellReady() {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const sink = new Writable({
              write(chunk, _encoding, callback) {
                try {
                  controller.enqueue(
                    chunk instanceof Uint8Array ? chunk : encoder.encode(String(chunk))
                  );
                  callback();
                } catch (err) {
                  callback(err instanceof Error ? err : new Error(String(err)));
                }
              },
              final(callback) {
                try {
                  controller.close();
                } catch {
                  // already closed/errored
                }
                callback();
              },
            });
            pipe(sink);
          },
          cancel() {
            // Client went away — stop rendering.
            clearTimeout(timer);
            abort(new Error("Response stream cancelled by client"));
          },
        });
        resolve(stream);
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
    timer = setTimeout(
      () => abort(new Error(`SSR render timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
}
