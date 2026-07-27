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
  /**
   * Called when SSR fails before the shell is sent. Reporting is the RSC layer's job — this module
   * is compiled into the SSR layer, which gets its own instance of every module it imports, so a
   * handler registered through `rshono/server` isn't reachable from in here.
   */
  onShellError?: (error: unknown) => void;
}

// From the baked config, not `process.env.NODE_ENV`: this is a property of the build, and a deploy
// target need not have a `process` at all.
const isDev = __RSHONO_CONFIG__.isDev;

/**
 * The last-resort 500 document, for when SSR fails before a single byte of the real shell was sent.
 *
 * Deliberately plain HTML with no client runtime attached: the flight payload comes from the same
 * failed render, so hydrating it would mismatch and React — whose root container is the whole
 * `document` — would tear the page down, blanking the very message being rendered here. Styling is
 * inline because the page's stylesheet links were part of the render that just failed.
 *
 * The detail is dev-only. In production this stays a generic message, matching how the `error` page
 * from routes.ts redacts.
 */
function SsrFailureDocument({ error }: { error: unknown }) {
  const detail = isDev ? (error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error)) : null;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>500 — Internal Server Error</title>
      </head>
      <body style={{ margin: 0, padding: '2rem', font: '16px/1.6 system-ui, -apple-system, sans-serif', color: '#18181b' }}>
        <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>500 — Internal Server Error</h1>
        <p style={{ margin: '0 0 1.5rem', color: '#52525b' }}>
          {isDev
            ? 'Server-side rendering failed before the page shell could be sent, so the app’s error page could not be reached either.'
            : 'Something went wrong while rendering this page. Please try again.'}
        </p>
        {detail && (
          <pre
            style={{
              margin: 0,
              padding: '1rem',
              overflow: 'auto',
              background: '#f4f4f5',
              borderLeft: '3px solid #ef4444',
              font: '13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {detail}
          </pre>
        )}
      </body>
    </html>
  );
}

export async function renderHTML(rscStream: ReadableStream<Uint8Array>, options: RenderHTMLOptions) {
  // One copy is rendered to HTML here; the other rides along in that HTML for the client to hydrate from.
  const [rscForSsr, rscForClient] = rscStream.tee();

  let payload: Promise<RscPayload>;
  function SsrRoot() {
    payload ??= createFromReadableStream<RscPayload>(rscForSsr, options.nonce ? { nonce: options.nonce } : undefined);
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
    if (!options.signal?.aborted) options.onShellError?.(error);
    status = 500;
    htmlStream = await renderToReadableStream(<SsrFailureDocument error={error} />, { nonce: options.nonce });
  }

  const responseStream = htmlStream.pipeThrough(injectRSCPayload(rscForClient, options.nonce ? { nonce: options.nonce } : undefined));

  return { stream: responseStream, status };
}
