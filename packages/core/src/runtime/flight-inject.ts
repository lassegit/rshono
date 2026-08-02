/**
 * Carrying the flight payload inside the HTML document, so the browser hydrates from bytes it
 * already has rather than fetching the page a second time.
 *
 * This is `rsc-html-stream/server`'s `injectRSCPayload` rewritten against the same wire format —
 * a run of `<script>(self.__FLIGHT_DATA||=[]).push("…")</script>` tags, which is what
 * `rsc-html-stream/client` on the browser side still reads. It is first-party for two reasons, both
 * measured on the benchmark app's `/ssr` (a 100-row table, ~30 kB of flight payload):
 *
 * - **`setImmediate` rather than `setTimeout(…, 0)`** for the batch boundary. Both are macrotasks,
 *   which is the part that matters (see {@link injectFlightPayload}), but a Node timer has a 1ms
 *   floor and every HTML flush paid it. Uncontended time-to-last-byte: 4.7ms → 3.0ms.
 * - **No UTF-8 round trip on the HTML.** The upstream version decodes every HTML chunk to a string
 *   and re-encodes it, only to test whether it ends with the document trailer. The trailer is found
 *   by comparing bytes here, and the chunks React produced are forwarded untouched.
 *
 * Under saturation neither shows up — a `/ssr` render is ~60% React's own flight encode and decode,
 * and the timer waits overlap with other requests' work — so this is a latency change, not a
 * throughput one.
 */

const encoder = new TextEncoder();

/** What React closes an `<html>` document with, and what this module re-emits after the last payload script. */
const TRAILER = '</body></html>';
const TRAILER_BYTES = encoder.encode(TRAILER);

/**
 * A macrotask boundary. `setImmediate` where there is one (Node, Bun, Deno's node compat), which is
 * the current turn's check phase rather than a timer; `setTimeout` is the portable fallback that
 * every other runtime has.
 */
type TaskHandle = ReturnType<typeof setTimeout> | ReturnType<typeof setImmediate>;
const schedule: (fn: () => void) => TaskHandle = typeof setImmediate === 'function' ? setImmediate : (fn) => setTimeout(fn, 0);
const unschedule = (handle: TaskHandle): void => {
  if (typeof setImmediate === 'function') clearImmediate(handle as ReturnType<typeof setImmediate>);
  else clearTimeout(handle as ReturnType<typeof setTimeout>);
};

export interface InjectOptions {
  /** Put on each injected `<script>` when the app runs under a CSP. */
  nonce?: string;
  /** Run once the last byte has been enqueued — the render deadline's release hook. */
  onFlush?: () => void;
}

/**
 * One reader over the flight stream, feeding both the copy that is rendered to HTML and the copy
 * that rides along inside it.
 *
 * `ReadableStream.prototype.tee()` is the obvious way to write this, but the flight stream is a
 * *byte* stream and the spec's tee for those copies every chunk into a fresh `Uint8Array` for the
 * second branch. Neither consumer here writes to the buffer it is given, so the copy buys nothing.
 * The SSR branch is the puller — React's flight client drains it eagerly — and each chunk it takes
 * is handed to the client branch on the way past, which keeps the source's backpressure intact.
 */
export function forkFlightStream(source: ReadableStream<Uint8Array>): [ReadableStream<Uint8Array>, ReadableStream<Uint8Array>] {
  const reader = source.getReader();
  let clientController: ReadableStreamDefaultController<Uint8Array>;
  const forClient = new ReadableStream<Uint8Array>({
    start(controller) {
      clientController = controller;
    },
  });
  const forSsr = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        clientController.close();
        return;
      }
      controller.enqueue(value);
      clientController.enqueue(value);
    },
    cancel(reason) {
      clientController.error(reason);
      return reader.cancel(reason);
    },
  });
  return [forSsr, forClient];
}

/**
 * Escapes the two sequences that would end a `<script>` element early.
 *
 * Guarded by an `includes('<')` because a flight payload usually has no `<` in it at all, and the
 * scan is far cheaper than two regex passes over 30 kB. `</script` becomes `</\script` rather than
 * `<\/script`, which would break the valid JS `0</script/` (a regexp literal).
 */
function escapeScript(script: string): string {
  return script.includes('<') ? script.replace(/<!--/g, '<\\!--').replace(/<\/(script)/gi, '</\\$1') : script;
}

export function injectFlightPayload(rscStream: ReadableStream<Uint8Array>, options: InjectOptions = {}): TransformStream<Uint8Array, Uint8Array> {
  const { nonce, onFlush } = options;
  const scriptOpen = `<script${nonce ? ` nonce="${nonce}"` : ''}>(self.__FLIGHT_DATA||=[]).push(`;
  const scriptClose = ')</script>';

  const { promise: flightWritten, resolve: flightDone } = Promise.withResolvers<void>();
  let startedFlight = false;

  const batch: Uint8Array[] = [];
  let boundary: TaskHandle | null = null;

  /**
   * Emits the HTML buffered since the last boundary, holding back the document trailer for
   * {@link TransformStream.flush} to re-emit after the payload scripts.
   *
   * The trailer is located by walking the batch backwards a byte at a time rather than by testing
   * the last chunk, because React's byte writer packs its output into 2 kB views and splits any
   * write that straddles one — so `</body></html>` can arrive as two chunks, and missing it would
   * put a second copy in the document.
   */
  function emitBatch(controller: TransformStreamDefaultController<Uint8Array>): void {
    let matched = 0;
    let trailerChunk = -1;
    let trailerAt = 0;
    for (let i = batch.length - 1; i >= 0 && matched < TRAILER_BYTES.length; i--) {
      const chunk = batch[i]!;
      let j = chunk.byteLength - 1;
      for (; j >= 0 && matched < TRAILER_BYTES.length; j--) {
        if (chunk[j] !== TRAILER_BYTES[TRAILER_BYTES.length - 1 - matched]) {
          matched = -1;
          break;
        }
        matched++;
      }
      if (matched === -1) break;
      if (matched === TRAILER_BYTES.length) {
        trailerChunk = i;
        trailerAt = j + 1;
      }
    }

    for (let i = 0; i < batch.length; i++) {
      const chunk = batch[i]!;
      if (trailerChunk !== -1 && i >= trailerChunk) {
        if (i === trailerChunk && trailerAt > 0) controller.enqueue(chunk.subarray(0, trailerAt));
        continue;
      }
      if (chunk.byteLength !== 0) controller.enqueue(chunk);
    }
    batch.length = 0;
    boundary = null;
  }

  async function writeFlight(controller: TransformStreamDefaultController<Uint8Array>): Promise<void> {
    const reader = rscStream.getReader();
    // `fatal`, so a chunk that split a multi-byte character throws rather than emitting U+FFFD and
    // corrupting the payload — the catch below falls back to a byte-exact encoding for it.
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const push = (literal: string) => controller.enqueue(encoder.encode(scriptOpen + literal + scriptClose));
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      try {
        push(escapeScript(JSON.stringify(decoder.decode(value, { stream: true }))));
      } catch {
        push(`Uint8Array.from(atob(${JSON.stringify(btoa(String.fromCodePoint(...value)))}), m => m.codePointAt(0))`);
      }
    }
    const remaining = decoder.decode();
    if (remaining.length) push(escapeScript(JSON.stringify(remaining)));
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      batch.push(chunk);
      if (boundary) return;
      // A macrotask, not a microtask: React writes a whole flush into its stream in one synchronous
      // run, but `pipeThrough` delivers those chunks to us one microtask at a time. Only a task
      // boundary guarantees the flush has arrived in full — a script injected between two of its
      // chunks would land inside a tag.
      boundary = schedule(() => {
        try {
          emitBatch(controller);
        } catch (error) {
          controller.error(error);
          flightDone();
          return;
        }
        if (!startedFlight) {
          startedFlight = true;
          writeFlight(controller)
            .catch((error) => controller.error(error))
            .then(flightDone);
        }
      });
    },
    async flush(controller) {
      await flightWritten;
      if (boundary) {
        unschedule(boundary);
        emitBatch(controller);
      }
      controller.enqueue(encoder.encode(TRAILER));
      onFlush?.();
    },
  });
}
