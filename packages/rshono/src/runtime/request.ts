/**
 * Render-request conventions — the contract between the browser runtime
 * and the RSC server:
 *
 *   GET  + `Accept: text/x-component`  → flight payload (soft navigation)
 *   GET  otherwise                     → HTML document (SSR)
 *   POST + `x-rsc-action: <id>`        → server action call from hydrated
 *                                        client code; responds with a
 *                                        flight payload carrying the
 *                                        action's return value.
 *   POST + form content-type, no id    → progressive-enhancement <form>
 *                                        submit (JS disabled); the action
 *                                        is identified by $ACTION_* form
 *                                        fields and the response is HTML.
 *
 * This module is imported from both the browser and the server — keep it
 * free of Node and DOM dependencies (createRscRenderRequest is only
 * called in the browser).
 */
const HEADER_ACTION_ID = 'x-rsc-action';
const RSC_CONTENT_TYPE = 'text/x-component';

export interface RenderRequest {
    /** Respond with a flight payload instead of HTML. */
    isRsc: boolean;
    /** A server action must run before rendering. */
    isAction: boolean;
    /** Action reference id (client-initiated calls only). */
    actionId?: string;
    url: URL;
}

/** Build the fetch Request for a soft navigation or a server action call. */
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
    const url = new URL(request.url);
    if (request.method === 'POST') {
        const actionId = request.headers.get(HEADER_ACTION_ID) ?? undefined;
        if (actionId) {
            return { isRsc: true, isAction: true, actionId, url };
        }
        // A plain form POST (no JS on the client). Whether it actually
        // carries an action is decided later by decodeAction(); the
        // response is a full HTML document either way.
        const isForm = FORM_CONTENT_TYPES.test(request.headers.get('content-type') ?? '');
        return { isRsc: false, isAction: isForm, url };
    }
    const isRsc = request.headers.get('accept')?.includes(RSC_CONTENT_TYPE) ?? false;
    return { isRsc, isAction: false, url };
}
