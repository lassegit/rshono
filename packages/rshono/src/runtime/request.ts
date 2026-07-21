const HEADER_ACTION_ID = 'x-rsc-action';
const RSC_CONTENT_TYPE = 'text/x-component';

export interface RenderRequest {
  isRsc: boolean;
  isAction: boolean;
  actionId?: string;
  url: URL;
}

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
    const isForm = FORM_CONTENT_TYPES.test(request.headers.get('content-type') ?? '');
    return { isRsc: false, isAction: isForm, url };
  }
  const isRsc = request.headers.get('accept')?.includes(RSC_CONTENT_TYPE) ?? false;
  return { isRsc, isAction: false, url };
}
