/**
 * Carrying the flight payload inside the HTML document, so the browser hydrates from bytes it
 * already has rather than fetching the page a second time.
 *
 * The wire format is `rsc-html-stream`'s — a run of
 * `<script>(self.__FLIGHT_DATA||=[]).push("…")</script>` tags — but the implementation is
 * first-party, because that package's `injectRSCPayload` tests each HTML chunk for the document
 * trailer with `endsWith`. React's byte writer packs its output into 2 kB views and splits any write
 * that straddles one, so `</body></html>` can arrive as two chunks; upstream then fails to hold it
 * back, and the document ends up with two trailers and the payload script after the first of them.
 * A page's byte layout is deterministic, so that is not an intermittent fault — an unlucky page is
 * malformed on every request. `test/unit.test.mjs` pins the split-trailer cases.
 *
 * The reader for this format is `readFlightPayload` in `entry.client.tsx`.
 */

/**
 * {@link Transformer} plus the `cancel` hook the Streams standard added for a cancelled readable side.
 *
 * Node calls it — verified on 22.x — but the bundled lib types have not caught up, so it is declared
 * here rather than reached for with an `any`. It matters because `cancel` is the only notification that
 * a response ended *without* finishing, and both users of it release a listener that would otherwise
 * outlive the request.
 */
export type CancellableTransformer<I, O> = Transformer<I, O> & { cancel?: (reason?: unknown) => void };

const encoder = new TextEncoder();

/** What React closes an `<html>` document with, and what this module re-emits after the last payload script. */
const TRAILER = '</body></html>';
const TRAILER_BYTES = encoder.encode(TRAILER);

/**
 * A macrotask boundary. `setImmediate` where there is one (Node, Bun, Deno's node compat), which is
 * the current turn's check phase rather than a timer; `setTimeout` is the portable fallback that
 * every other runtime has. A Node timer has a 1ms floor and every HTML flush would pay it — worth
 * the two lines: uncontended time-to-last-byte on a 30 kB payload, 4.7ms → 3.0ms.
 */
type TaskHandle = ReturnType<typeof setTimeout> | ReturnType<typeof setImmediate>;
const hasSetImmediate = typeof setImmediate === 'function';
const schedule: (fn: () => void) => TaskHandle = hasSetImmediate ? setImmediate : (fn) => setTimeout(fn, 0);
const unschedule = (handle: TaskHandle): void => {
  if (hasSetImmediate) clearImmediate(handle as ReturnType<typeof setImmediate>);
  else clearTimeout(handle as ReturnType<typeof setTimeout>);
};

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

/**
 * The bytes of `chunk` as a latin1 string, which is the form `btoa` takes.
 *
 * Sliced rather than `String.fromCharCode(...chunk)`, which passes one argument per byte and
 * overflows the call stack on a chunk of any size. Only reached for a chunk that split a multi-byte
 * character, so it is off the hot path and the slice size is a stack-safety choice, not a tuned one.
 */
function latin1(chunk: Uint8Array): string {
  let out = '';
  for (let at = 0; at < chunk.length; at += 8192) out += String.fromCharCode(...chunk.subarray(at, at + 8192));
  return out;
}

/** Whether `buffer`'s first `length` bytes end with the document trailer. */
function endsWithTrailer(buffer: Uint8Array, length: number): boolean {
  if (length < TRAILER_BYTES.length) return false;
  const from = length - TRAILER_BYTES.length;
  for (let i = 0; i < TRAILER_BYTES.length; i++) {
    if (buffer[from + i] !== TRAILER_BYTES[i]) return false;
  }
  return true;
}

export function injectFlightPayload(
  rscStream: ReadableStream<Uint8Array>,
  options: { nonce?: string; onDone?: () => void } = {},
): TransformStream<Uint8Array, Uint8Array> {
  const { nonce, onDone } = options;
  const scriptOpen = `<script${nonce ? ` nonce="${nonce}"` : ''}>(self.__FLIGHT_DATA||=[]).push(`;
  const scriptClose = ')</script>';

  const { promise: flightWritten, resolve: flightDone } = Promise.withResolvers<void>();
  let startedFlight = false;

  const batch: Uint8Array[] = [];
  let boundary: TaskHandle | null = null;

  /**
   * Set once the consumer has gone away, so nothing downstream tries to enqueue into a readable that
   * can no longer take it.
   *
   * It cannot simply be the `cancel` hook that sets this. Per the Streams standard, cancelling the
   * readable *after* the close algorithm has started returns the pending finish promise without
   * running the transformer's `cancel` at all — and `flush` awaiting the whole flight payload is
   * precisely that window. So a failed enqueue is also treated as the signal, wherever one happens.
   */
  let cancelled = false;
  /** Held so {@link cancelled} can release the teed RSC branch rather than leaving it to be pumped. */
  let flightReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  /**
   * Emits the HTML buffered since the last boundary, holding back the document trailer for
   * {@link TransformStream.flush} to re-emit after the payload scripts.
   *
   * The batch is joined before the trailer is looked for, so a trailer React split across two views
   * is still found — that is the whole reason this module is not `rsc-html-stream/server`. React
   * writes its final flush in one synchronous run, so every chunk of the trailer lands in the same
   * batch; a trailer split *across* batches is not a shape React produces.
   */
  function emitBatch(controller: TransformStreamDefaultController<Uint8Array>): void {
    boundary = null;
    let total = 0;
    for (const chunk of batch) total += chunk.byteLength;
    if (total === 0) {
      batch.length = 0;
      return;
    }

    const joined = new Uint8Array(total);
    let at = 0;
    for (const chunk of batch) {
      joined.set(chunk, at);
      at += chunk.byteLength;
    }
    batch.length = 0;

    const end = endsWithTrailer(joined, total) ? total - TRAILER_BYTES.length : total;
    if (end > 0) controller.enqueue(joined.subarray(0, end));
  }

  async function writeFlight(controller: TransformStreamDefaultController<Uint8Array>): Promise<void> {
    const reader = (flightReader = rscStream.getReader());
    // `fatal`, so a chunk that split a multi-byte character throws rather than emitting U+FFFD and
    // corrupting the payload — the catch below falls back to a byte-exact encoding for it.
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const push = (literal: string) => controller.enqueue(encoder.encode(scriptOpen + literal + scriptClose));
    for (;;) {
      if (cancelled) return;
      const { done, value } = await reader.read();
      if (done) break;
      // Only the *decode* is guarded. Wrapping the `push` in the same `try` conflated a split
      // multi-byte character with a controller nobody is reading any more, and answered the second by
      // re-encoding the chunk and enqueueing it again — which throws in turn, out of the catch.
      let literal: string;
      try {
        literal = escapeScript(JSON.stringify(decoder.decode(value, { stream: true })));
      } catch {
        literal = `Uint8Array.from(atob(${JSON.stringify(btoa(latin1(value)))}), m => m.codePointAt(0))`;
      }
      if (cancelled) return;
      // A failed enqueue means the consumer is gone. Stop pumping and release the RSC branch, so
      // `flush` unparks now rather than whenever the flight payload would have ended on its own.
      try {
        push(literal);
      } catch {
        cancelled = true;
        reader.cancel().catch(() => {});
        return;
      }
    }
    if (cancelled) return;
    const remaining = decoder.decode();
    if (remaining.length) push(escapeScript(JSON.stringify(remaining)));
  }

  const transformer: CancellableTransformer<Uint8Array, Uint8Array> = {
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
      // That await spans the entire flight payload, and the consumer can go away inside it — a
      // browser's stop button, a navigation away, a proxy timeout. `cancel` below is *not* what tells
      // us so (see `cancelled`), which leaves the enqueue throwing `ERR_INVALID_STATE` as the only
      // signal. Unguarded it rejects `flush`, and nothing owns that rejection: it surfaces as an
      // unhandled one and, where the host does not swallow it, takes the process down.
      try {
        if (boundary) {
          unschedule(boundary);
          emitBatch(controller);
        }
        if (!cancelled) controller.enqueue(encoder.encode(TRAILER));
      } catch {
        // Nowhere left to put the trailer. A response the client abandoned is not a fault.
        cancelled = true;
        flightReader?.cancel().catch(() => {});
      } finally {
        // Unconditional, and the reason this is a `finally`: `onDone` is what releases the abort
        // forwarder in `renderComponent`, so it has to run however the response ended.
        onDone?.();
      }
    },
    cancel(reason) {
      cancelled = true;
      if (boundary) {
        unschedule(boundary);
        boundary = null;
      }
      batch.length = 0;
      // Without this the teed RSC branch keeps being pumped for a response nobody will read, and the
      // tee's other half buffers every chunk waiting for this one to catch up.
      flightReader?.cancel(reason).catch(() => {});
      // Unparks `flush` if it is waiting on a payload that will now never arrive.
      flightDone();
      onDone?.();
    },
  };
  return new TransformStream<Uint8Array, Uint8Array>(transformer);
}
