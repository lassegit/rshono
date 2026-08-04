/**
 * Small header utilities shared by the response-header defaults and the prerendered-page cache. Kept
 * apart from both because getting `Vary` and `ETag` comparison subtly wrong is exactly the kind of
 * thing that only shows up behind a CDN.
 */

/**
 * Adds `value` to the `Vary` header without discarding what is already there.
 *
 * `Vary` is a list, and the framework's own entry (`Accept` — an HTML document or a flight payload from
 * one URL) is not necessarily the only one: a route, a middleware or a proxy may have added its own.
 * A plain `set` would drop the others, and a cache would then serve one variant in place of another.
 * `*` is left alone: it already means "never reuse this".
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
 * both sides: a proxy or CDN that gzips on the way out changes the bytes without changing the
 * representation, and is entitled to weaken the validator when it does.
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
