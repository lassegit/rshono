import type { MiddlewareHandler } from 'hono';
import { COMPRESSIBLE_CONTENT_TYPE_REGEX } from 'hono/utils/compress';
import { Duplex } from 'node:stream';
import { constants, createGzip } from 'node:zlib';
import { appendVary } from './headers.js';

/** Below this many uncompressed bytes the gzip framing costs more than it saves. Only applied when the length is known up front. */
const COMPRESSION_THRESHOLD_BYTES = 1024;

/** `Cache-Control: no-transform` is a proxy asking not to be re-encoded; honour it. */
const NO_TRANSFORM = /(?:^|,)\s*no-transform\s*(?:,|$)/i;

/** Every browser that sends `Accept-Encoding` at all accepts gzip, so one encoding covers the field. */
function acceptsGzip(acceptEncoding: string | undefined): boolean {
  if (!acceptEncoding) return false;
  // No `q=` anywhere (what every real browser sends) means there is no refusal to look for.
  if (!acceptEncoding.includes('q=')) return acceptEncoding.includes('gzip') || acceptEncoding.includes('*');
  return acceptEncoding.split(',').some((entry) => {
    const [name, ...params] = entry.trim().split(';');
    if (name.toLowerCase() !== 'gzip' && name.trim() !== '*') return false;
    // `gzip;q=0` is an explicit refusal, not an offer.
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    return q === undefined || Number(q.slice(2)) > 0;
  });
}

/**
 * Gzips compressible responses, **without breaking streaming**.
 *
 * The obvious implementation — the platform's `CompressionStream`, which Hono's own `compress`
 * middleware uses — buffers: zlib holds bytes back until it has a full block, so a streamed SSR
 * shell would sit in the compressor instead of reaching the browser. That defeats the entire point
 * of streaming a page. Node's zlib with `Z_SYNC_FLUSH` instead ends every write at a byte boundary
 * the client can decode immediately, so each chunk the renderer flushes is a chunk the browser
 * receives, at the cost of a few bytes of framing per chunk.
 *
 * Registered as the outermost middleware so it sees the finished response, headers and all.
 */
export function compress(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    const res = c.res;
    if (c.req.method === 'HEAD') return;
    // 204/304 have no body to speak of; a 206 range is counted in *uncompressed* bytes.
    if (res.status === 204 || res.status === 304 || res.status === 206) return;
    if (res.headers.has('content-encoding')) return;
    if (!COMPRESSIBLE_CONTENT_TYPE_REGEX.test(res.headers.get('content-type') ?? '')) return;
    if (NO_TRANSFORM.test(res.headers.get('cache-control') ?? '')) return;

    const contentLength = res.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) < COMPRESSION_THRESHOLD_BYTES) return;
    if (!acceptsGzip(c.req.header('accept-encoding'))) return;

    // Read `.body` only once we know we're compressing: it is what makes @hono/node-server's
    // lightweight Response materialize a real one, throwing away the [status, body, headers] tuple
    // it would otherwise write straight to the socket. The guards above touch only `.status` and
    // `.headers`, which leave that fast path intact for every response we decide to pass through.
    const body = res.body;
    if (!body) return;

    const gzip = Duplex.toWeb(createGzip({ flush: constants.Z_SYNC_FLUSH })) as unknown as {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
    };

    c.res = new Response(body.pipeThrough(gzip), res);
    c.res.headers.set('content-encoding', 'gzip');
    c.res.headers.delete('content-length'); // no longer the length of what goes on the wire
    appendVary(c.res.headers, 'Accept-Encoding');

    // The bytes changed, so a strong validator no longer describes them — but it is still the same
    // representation, which is exactly what a weak one means.
    const etag = c.res.headers.get('etag');
    if (etag && !etag.startsWith('W/')) c.res.headers.set('etag', `W/${etag}`);
  };
}
