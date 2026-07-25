/**
 * Small header utilities shared by the response-header defaults, the compressor and the
 * prerendered-page cache. Kept apart from any one of them because getting `Vary` and `ETag`
 * comparison subtly wrong is exactly the kind of thing that only shows up behind a CDN.
 */

/**
 * Adds `value` to the `Vary` header without discarding what is already there.
 *
 * `Vary` is a list, and two different concerns write to it here — content negotiation on `Accept`
 * (HTML document vs flight payload) and `Accept-Encoding` from the compressor. A plain `set` from
 * whichever ran last would drop the other, and a cache would then happily serve one variant in
 * place of the other. `*` is left alone: it already means "never reuse this".
 */
export function appendVary(headers: Headers, value: string): void {
  const existing = headers.get('vary');
  if (existing === null) {
    headers.set('vary', value);
    return;
  }
  if (existing.trim() === '*') return;
  const already = existing.split(',').some((entry) => entry.trim().toLowerCase() === value.toLowerCase());
  if (!already) headers.set('vary', `${existing}, ${value}`);
}

/**
 * True when an `If-None-Match` request header matches `etag`, i.e. the client already holds this
 * exact body and should be answered with a 304.
 *
 * The header carries a *list*, and each entry may be weak (`W/"…"`). The weak prefix is ignored on
 * both sides because the compressor rewrites a strong tag to a weak one when it changes the bytes
 * on the wire — the representation is still the same one the client cached.
 */
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const normalize = (value: string) => value.trim().replace(/^W\//, '');
  const wanted = normalize(etag);
  return ifNoneMatch.split(',').some((entry) => {
    const candidate = normalize(entry);
    return candidate === '*' || candidate === wanted;
  });
}
