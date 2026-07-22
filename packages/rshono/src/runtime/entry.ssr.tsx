import React from 'react';
import type { ReactFormState } from 'react-dom/client';
import { renderToReadableStream } from 'react-dom/server';
import { createFromReadableStream } from 'react-server-dom-rspack/client';
import { injectRSCPayload } from 'rsc-html-stream/server';
import { isControlDigest } from './control.js';
import type { RscPayload } from './entry.rsc.js';

export interface RenderHTMLOptions {
  bootstrapScripts?: string[];
  formState?: ReactFormState;
  signal?: AbortSignal;
  nonce?: string;
}

export async function renderHTML(rscStream: ReadableStream<Uint8Array>, options: RenderHTMLOptions) {
  const [rscStream1, rscStream2] = rscStream.tee();

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
    if (isControlDigest((error as { digest?: unknown } | null)?.digest)) throw error;
    if (!options.signal?.aborted) console.error('[rshono] SSR shell error:', error);
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
