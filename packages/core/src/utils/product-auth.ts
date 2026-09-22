/**
 * Product tenants are published on the product's own host at `/auth`
 * (`https://lotly.lat/auth`). The staff host keeps path-based tenant ids.
 * The product site itself stays on every other path of that host.
 */
export const productAuthPrefix = '/auth';

const stripTrailingSlash = (pathname: string) =>
  pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

/**
 * `/auth` and everything under it. `/authentication`, `/auth2`, and `/Auth`
 * do not match. Callers must pass `URL.pathname`, which already resolved `.`
 * and `..`.
 */
export const isProductAuthPath = (pathname: string): boolean => {
  const normalized = stripTrailingSlash(pathname);

  return normalized === productAuthPrefix || pathname.startsWith(`${productAuthPrefix}/`);
};

/**
 * Product auth is HTTPS on the default port. A non-default port would mint an
 * issuer that collides with the admin console or advertises `http://`.
 */
export const isProductAuthRequest = (url: URL): boolean =>
  url.protocol === 'https:' && url.port === '' && isProductAuthPath(url.pathname);

/** Issuer base for a product host. The request path is ignored. No trailing slash. */
export const productAuthEndpoint = (url: URL): string => new URL(productAuthPrefix, url.origin).href;

/**
 * `oidc-provider` publishes absolute URLs from `ctx.mountPath`. `koa-mount` keeps
 * only the inner `/oidc` and drops an outer prefix such as `/auth` or `/{tenantId}`.
 */
export const withOuterOidcMount = (
  outerMount: string | undefined,
  innerMount: string | undefined
): string => {
  const inner = innerMount && innerMount !== '/' ? innerMount : '/oidc';

  if (!outerMount || inner === outerMount || inner.startsWith(`${outerMount}/`)) {
    return inner;
  }

  return `${outerMount}${inner}`;
};

/**
 * Mount path for a custom-domain tenant instance. Classic custom domains stay
 * at the host root. Product auth mounts at `/auth`.
 */
export const customDomainMountPath = (customDomain: string | undefined): string | undefined => {
  if (!customDomain) {
    return;
  }

  const { pathname } = new URL(customDomain);

  return stripTrailingSlash(pathname) === productAuthPrefix ? productAuthPrefix : undefined;
};

/**
 * Cookie Path for this tenant instance. `/` on a product host would send the
 * IdP session to the product app. Staff and classic custom domains stay at `/`.
 */
export const sessionCookiePath = (endpoint: URL): string =>
  stripTrailingSlash(endpoint.pathname) === productAuthPrefix ||
  endpoint.pathname.startsWith(`${productAuthPrefix}/`)
    ? productAuthPrefix
    : '/';

/**
 * Scope `Set-Cookie` paths under `/auth` so a shared product origin does not
 * receive IdP cookies. `__Host-` cookies are left untouched: that prefix
 * requires `Path=/`, and callers must not emit it for a product host.
 */
export const rewriteProductAuthSetCookie = (cookie: string): string => {
  const name = cookie.split('=', 1)[0]?.trim() ?? '';

  if (name.startsWith('__Host-')) {
    return cookie;
  }

  if (!/;\s*path=/i.test(cookie)) {
    return `${cookie}; Path=${productAuthPrefix}`;
  }

  return cookie.replaceAll(/;\s*path=([^;]*)/gi, (_match, rawPath: string) => {
    const path = rawPath.trim();

    if (path === productAuthPrefix || path.startsWith(`${productAuthPrefix}/`)) {
      return `; Path=${path}`;
    }

    if (path === '/') {
      return `; Path=${productAuthPrefix}`;
    }

    if (path.startsWith('/')) {
      return `; Path=${productAuthPrefix}${path}`;
    }

    return `; Path=${path}`;
  });
};
