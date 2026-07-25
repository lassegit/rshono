// The compressor's whole reason for existing is that it must not break streaming, so that is what
// these test first: a chunk the renderer flushes has to reach the client while the response is
// still open. A buffering implementation (the platform `CompressionStream`) hangs the first test.
import assert from 'node:assert/strict';
import { Duplex } from 'node:stream';
import { describe, test } from 'node:test';
import { createGunzip } from 'node:zlib';
import { Hono } from 'hono';

import { compress } from '../dist/server/compress.js';

const encoder = new TextEncoder();
const GZIP = { 'accept-encoding': 'gzip' };

function appWith(handler) {
  const app = new Hono();
  app.use(compress());
  app.get('/', handler);
  return app;
}

/** Reads one decoded chunk from a gzip response, without waiting for the stream to finish. */
function firstDecodedChunk(response) {
  const reader = response.body.pipeThrough(Duplex.toWeb(createGunzip())).getReader();
  return reader.read().then(({ value }) => new TextDecoder().decode(value));
}

/** A body that emits `head`, then waits for a signal before emitting `tail` and closing. */
function gatedStream(head, tail) {
  const gate = Promise.withResolvers();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(head));
      await gate.promise;
      controller.enqueue(encoder.encode(tail));
      controller.close();
    },
  });
  return { stream, open: gate.resolve };
}

describe('compress', () => {
  test('flushes each chunk instead of buffering the whole response', { timeout: 5000 }, async () => {
    const { stream, open } = gatedStream('<!DOCTYPE html><head>shell</head>', '<body>the rest</body>');
    const app = appWith((c) => c.body(stream, 200, { 'content-type': 'text/html;charset=utf-8' }));

    const response = await app.request('/', { headers: GZIP });
    assert.equal(response.headers.get('content-encoding'), 'gzip');

    // If compression buffered, this read would not resolve until `open()` — which never happens,
    // because it is called after. The test would time out rather than pass.
    const shell = await firstDecodedChunk(response);
    assert.match(shell, /shell/, 'the shell must arrive while the body is still streaming');
    open();
  });

  test('round-trips the full body', async () => {
    const body = 'x'.repeat(5000);
    const app = appWith((c) => c.text(body));
    const response = await app.request('/', { headers: GZIP });

    assert.equal(response.headers.get('content-encoding'), 'gzip');
    assert.equal(response.headers.get('content-length'), null, 'the uncompressed length would be a lie');

    const decoded = await new Response(response.body.pipeThrough(Duplex.toWeb(createGunzip()))).text();
    assert.equal(decoded, body);
  });

  test('advertises the encoding in Vary without dropping an existing entry', async () => {
    const app = appWith((c) => c.text('y'.repeat(2000), 200, { vary: 'Accept' }));
    const response = await app.request('/', { headers: GZIP });
    assert.equal(response.headers.get('vary'), 'Accept, Accept-Encoding');
  });

  test('weakens a strong ETag, because the bytes on the wire changed', async () => {
    const app = appWith((c) => c.text('z'.repeat(2000), 200, { etag: '"abc"' }));
    const response = await app.request('/', { headers: GZIP });
    assert.equal(response.headers.get('etag'), 'W/"abc"');
  });

  test('leaves responses alone when it should', async () => {
    const big = 'q'.repeat(4000);
    const cases = [
      { name: 'no Accept-Encoding', headers: {}, handler: (c) => c.text(big) },
      { name: 'gzip explicitly refused', headers: { 'accept-encoding': 'gzip;q=0' }, handler: (c) => c.text(big) },
      { name: 'below the size threshold', headers: GZIP, handler: (c) => c.text('tiny', 200, { 'content-length': '4' }) },
      { name: 'not a compressible type', headers: GZIP, handler: (c) => c.body(big, 200, { 'content-type': 'image/png' }) },
      { name: 'server-sent events', headers: GZIP, handler: (c) => c.body(big, 200, { 'content-type': 'text/event-stream' }) },
      { name: 'already encoded', headers: GZIP, handler: (c) => c.body(big, 200, { 'content-type': 'text/html', 'content-encoding': 'br' }) },
      { name: 'no-transform requested', headers: GZIP, handler: (c) => c.text(big, 200, { 'cache-control': 'public, no-transform' }) },
      { name: 'not modified', headers: GZIP, handler: (c) => c.body(null, 304, { 'content-type': 'text/html' }) },
    ];

    for (const { name, headers, handler } of cases) {
      const response = await appWith(handler).request('/', { headers });
      assert.notEqual(response.headers.get('content-encoding'), 'gzip', `${name}: must not be gzipped`);
    }
  });

  test('compresses a short body of undeclared length, since the size is not knowable in time', async () => {
    // Pinning the trade-off rather than leaving it to chance: measuring an undeclared length means
    // reading ahead, and reading ahead on a *streaming* body is exactly what must not happen. So a
    // small response with no Content-Length is compressed, which costs a few bytes of framing.
    const response = await appWith((c) => c.text('tiny')).request('/', { headers: GZIP });
    assert.equal(response.headers.get('content-encoding'), 'gzip');
  });

  test('accepts a wildcard Accept-Encoding', async () => {
    const response = await appWith((c) => c.text('w'.repeat(2000))).request('/', { headers: { 'accept-encoding': '*' } });
    assert.equal(response.headers.get('content-encoding'), 'gzip');
  });
});
