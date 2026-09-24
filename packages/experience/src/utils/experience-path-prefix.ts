import { isObject } from '@silverhand/essentials';

/**
 * Outer mount for the experience SPA (`/auth` or `/{tenantId}`). Prefer the SSR
 * payload; fall back to detecting a product `/auth` URL when SSR did not inject.
 */
export const getExperiencePathPrefix = (): string => {
  if (isObject(logtoSsr) && typeof logtoSsr.pathPrefix === 'string' && logtoSsr.pathPrefix) {
    return logtoSsr.pathPrefix;
  }

  const { pathname } = window.location;

  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    return '/auth';
  }

  return '';
};

/** Everything of a request that survives on the rebuilt one (URL aside). */
const copyRequestInit = (request: Request): RequestInit => ({
  method: request.method,
  headers: request.headers,
  credentials: request.credentials,
  /*
   * `navigate` is only valid for navigations; a fetch request never carries it, but
   * WebKit throws when it sees it on a constructed `Request`.
   */
  mode: request.mode === 'navigate' ? 'same-origin' : request.mode,
  cache: request.cache,
  redirect: request.redirect,
  referrer: request.referrer,
  referrerPolicy: request.referrerPolicy,
  integrity: request.integrity,
  keepalive: request.keepalive,
  signal: request.signal,
});

/**
 * Rewrite same-origin `/api/...` calls so cookies with `Path=/auth` are sent.
 *
 * The body is copied explicitly (as bytes) instead of rebuilding the request with
 * `new Request(url, request)`: Safari/WebKit does not carry the body over that way.
 * It fails with `NotSupportedError: ReadableStream uploading is not supported`, and
 * when the caller swallows the error the request arrives empty, so the Experience API
 * answers `guard.invalid_input` (`interactionEvent: Required`) and sign-in dies on
 * iPhone/iPad. Copying the bytes keeps JSON and `multipart/form-data` payloads
 * byte-identical (the boundary already lives in the copied `content-type`).
 */
export const rewriteExperienceApiRequest = async (
  request: Request
): Promise<Request | undefined> => {
  const prefix = getExperiencePathPrefix();

  if (!prefix) {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    return;
  }

  url.pathname = `${prefix}${url.pathname}`;

  if (request.body === null || request.bodyUsed) {
    return new Request(url, copyRequestInit(request));
  }

  const body = await request.arrayBuffer();

  return new Request(url, { ...copyRequestInit(request), body });
};
