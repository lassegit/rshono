/**
 * SSR entry — lives in the 'server-side-rendering' layer of the server
 * bundle (see builder/rspack-config.ts), where React resolves WITHOUT
 * the react-server condition: this is the classic react-dom renderer
 * that turns a flight payload back into an HTML stream.
 *
 * Flow: tee the flight stream — one copy is deserialized to a VDOM and
 * rendered to HTML, the other is injected into that HTML as inline
 * <script> chunks (rsc-html-stream) so the browser hydrates from the
 * exact payload that produced the markup.
 */
import React from 'react';
import type { ReactFormState } from 'react-dom/client';
import { renderToReadableStream } from 'react-dom/server';
import { createFromReadableStream } from 'react-server-dom-rspack/client';
import { injectRSCPayload } from 'rsc-html-stream/server';
import type { RscPayload } from './entry.rsc.js';

export interface RenderHTMLOptions {
    /** Entry scripts of the page (ServerEntry.entryJsFiles). */
    bootstrapScripts?: string[];
    /** useActionState result of a progressive-enhancement form POST. */
    formState?: ReactFormState;
    /** Render deadline / client-disconnect abort (from entry.rsc). */
    signal?: AbortSignal;
    /** CSP nonce for bootstrap scripts and the inlined flight payload. */
    nonce?: string;
}

export async function renderHTML(rscStream: ReadableStream<Uint8Array>, options: RenderHTMLOptions) {
    const [rscStream1, rscStream2] = rscStream.tee();

    // Deserialize the flight payload back to a VDOM. Kicked off inside
    // the react-dom render (React.use) so preinit/preload hints work.
    let payload: Promise<RscPayload>;
    function SsrRoot() {
        payload ??= createFromReadableStream<RscPayload>(rscStream1, options.nonce ? { nonce: options.nonce } : undefined);
        return React.use(payload).root;
    }

    let htmlStream: ReadableStream<Uint8Array>;
    let status: number | undefined;
    try {
        htmlStream = await renderToReadableStream(<SsrRoot />, {
            bootstrapScripts: options.bootstrapScripts,
            formState: options.formState,
            signal: options.signal,
            nonce: options.nonce,
        });
    } catch (error) {
        // Shell failed to render (or timed out / client disconnected).
        // Ship an empty shell and let the client replay the payload — the
        // error surfaces in an error boundary (or the browser console)
        // instead of a blank connection reset.
        if (!options.signal?.aborted) console.error('[rsc-hono] SSR shell error:', error);
        status = 500;
        htmlStream = await renderToReadableStream(
            <html>
                <body>
                    <noscript>Internal Server Error: SSR failed</noscript>
                </body>
            </html>,
            { bootstrapScripts: options.bootstrapScripts, nonce: options.nonce },
        );
    }

    const responseStream = htmlStream.pipeThrough(injectRSCPayload(rscStream2, options.nonce ? { nonce: options.nonce } : undefined));

    return { stream: responseStream, status };
}
