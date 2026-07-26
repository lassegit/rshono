const HEADER_ACTION_ID = 'x-rsc-action';
const RSC_CONTENT_TYPE = 'text/x-component';

/**
 * The four distinct shapes an incoming render request can take, modeled as a
 * discriminated union so illegal combinations (e.g. an action id on a GET) are
 * unrepresentable and every consumer dispatches exhaustively on `kind`.
 *
 * - `document` — a normal navigation; respond with a full SSR HTML document.
 * - `rsc` — a soft-navigation flight fetch (`Accept: text/x-component`).
 * - `form-action` — a progressive-enhancement `<form>` POST (no JavaScript).
 * - `rsc-action` — a client-initiated server-action call carrying an action id.
 */
export type RenderRequest = { kind: 'document' } | { kind: 'rsc' } | { kind: 'form-action' } | { kind: 'rsc-action'; actionId: string };

export function createRscRenderRequest(urlString: string, action?: { id: string; body: BodyInit }): Request {
  const url = new URL(urlString, location.origin);
  const headers = new Headers({ Accept: RSC_CONTENT_TYPE });
  if (action) headers.set(HEADER_ACTION_ID, action.id);
  return new Request(url, {
    method: action ? 'POST' : 'GET',
    headers,
    body: action?.body,
  });
}

const FORM_CONTENT_TYPES = /^(?:multipart\/form-data|application\/x-www-form-urlencoded)/i;

export function parseRenderRequest(request: Request): RenderRequest {
  if (request.method === 'POST') {
    const actionId = request.headers.get(HEADER_ACTION_ID);
    if (actionId) return { kind: 'rsc-action', actionId };
    if (FORM_CONTENT_TYPES.test(request.headers.get('content-type') ?? '')) return { kind: 'form-action' };
    return { kind: 'document' };
  }
  return { kind: acceptsFlight(request) ? 'rsc' : 'document' };
}

/** Whether the client asked for a flight payload. For GET paths that only need the boolean. */
export function acceptsFlight(request: Request): boolean {
  return request.headers.get('accept')?.includes(RSC_CONTENT_TYPE) ?? false;
}

/** True when the response should be a flight payload rather than an HTML document. */
export function wantsRsc(request: RenderRequest): boolean {
  return request.kind === 'rsc' || request.kind === 'rsc-action';
}

/** True when the request carries a server action to run before rendering. */
export function isActionRequest(request: RenderRequest): request is Extract<RenderRequest, { kind: 'form-action' | 'rsc-action' }> {
  return request.kind === 'form-action' || request.kind === 'rsc-action';
}
