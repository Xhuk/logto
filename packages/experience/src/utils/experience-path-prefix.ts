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

/** Rewrite same-origin `/api/...` calls so cookies with `Path=/auth` are sent. */
export const rewriteExperienceApiRequest = (request: Request): Request | undefined => {
  const prefix = getExperiencePathPrefix();

  if (!prefix) {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    return;
  }

  url.pathname = `${prefix}${url.pathname}`;

  return new Request(url, request);
};
