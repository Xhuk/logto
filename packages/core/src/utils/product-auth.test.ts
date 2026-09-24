import { appendPath } from '@silverhand/essentials';

import {
  customDomainMountPath,
  isProductAuthPath,
  isProductAuthRequest,
  productAuthEndpoint,
  rewriteProductAuthSetCookie,
  sessionCookiePath,
  withExperienceMount,
  withOuterOidcMount,
  experiencePathPrefix,
} from './product-auth.js';

describe('product auth path', () => {
  it('accepts /auth and its descendants only', () => {
    expect(isProductAuthPath('/auth')).toBe(true);
    expect(isProductAuthPath('/auth/')).toBe(true);
    expect(isProductAuthPath('/auth/oidc/auth')).toBe(true);
    expect(isProductAuthPath('/auth/oidc/.well-known/openid-configuration')).toBe(true);
    expect(isProductAuthPath('/authentication')).toBe(false);
    expect(isProductAuthPath('/auth2')).toBe(false);
    expect(isProductAuthPath('/author')).toBe(false);
    expect(isProductAuthPath('/Auth')).toBe(false);
    expect(isProductAuthPath('/auth.json')).toBe(false);
    expect(isProductAuthPath('/')).toBe(false);
    expect(isProductAuthPath('/3ni0yi/oidc/auth')).toBe(false);
  });

  it('requires https on the default port', () => {
    expect(isProductAuthRequest(new URL('https://lotly.lat/auth'))).toBe(true);
    expect(isProductAuthRequest(new URL('https://lotly.lat:443/auth/oidc/token'))).toBe(true);
    expect(isProductAuthRequest(new URL('http://lotly.lat/auth'))).toBe(false);
    expect(isProductAuthRequest(new URL('https://lotly.lat:8443/auth'))).toBe(false);
    expect(isProductAuthRequest(new URL('https://lotly.lat/'))).toBe(false);
    expect(isProductAuthRequest(new URL('https://lotly.lat/auth%2Foidc'))).toBe(false);
  });

  it('uses the URL parser so dot segments cannot escape /auth', () => {
    expect(isProductAuthRequest(new URL('https://lotly.lat/auth/../3ni0yi'))).toBe(false);
    expect(isProductAuthRequest(new URL('https://lotly.lat/auth/./oidc/auth'))).toBe(true);
  });

  it('builds an issuer base that keeps /auth when /oidc is appended', () => {
    const endpoint = productAuthEndpoint(
      new URL('https://lotly.lat/auth/oidc/auth?login_hint=xhuk')
    );

    expect(endpoint).toBe('https://lotly.lat/auth');
    expect(appendPath(new URL(endpoint), '/oidc').href).toBe('https://lotly.lat/auth/oidc');
    expect(customDomainMountPath(endpoint)).toBe('/auth');
    expect(customDomainMountPath('https://logto.mock.com')).toBeUndefined();
    expect(customDomainMountPath(undefined)).toBeUndefined();
    expect(sessionCookiePath(new URL(endpoint))).toBe('/auth');
    expect(sessionCookiePath(new URL('https://user.logto.mock/app/3ni0yi'))).toBe('/');
  });

  it('keeps the outer prefix on the OIDC mount path', () => {
    expect(withOuterOidcMount('/auth', '/oidc')).toBe('/auth/oidc');
    expect(withOuterOidcMount('/3ni0yi', '/oidc')).toBe('/3ni0yi/oidc');
    expect(withOuterOidcMount('/auth', '/auth/oidc')).toBe('/auth/oidc');
    expect(withOuterOidcMount(undefined, '/oidc')).toBe('/oidc');
  });

  it('keeps experience prompts under the tenant or product mount', () => {
    expect(withExperienceMount(new URL('https://lotly.lat/auth'), 'sign-in?app_id=x')).toBe(
      '/auth/sign-in?app_id=x'
    );
    expect(
      withExperienceMount(new URL('https://lotly.lat/auth/'), 'identifier-sign-in?identifier=username')
    ).toBe('/auth/identifier-sign-in?identifier=username');
    expect(withExperienceMount(new URL('https://idp.example/3ni0yi'), 'consent')).toBe(
      '/3ni0yi/consent'
    );
    expect(withExperienceMount(new URL('https://idp.example/'), 'sign-in')).toBe('/sign-in');
    expect(withExperienceMount(new URL('https://idp.example'), '/sign-in')).toBe('/sign-in');
    expect(experiencePathPrefix(new URL('https://lotly.lat/auth'))).toBe('/auth');
    expect(experiencePathPrefix(new URL('https://idp.example/'))).toBe('');
  });
});

describe('rewriteProductAuthSetCookie()', () => {
  it('scopes root and inner paths under /auth and leaves an existing /auth path', () => {
    expect(rewriteProductAuthSetCookie('sid=abc; HttpOnly')).toBe(
      'sid=abc; HttpOnly; Path=/auth'
    );
    expect(rewriteProductAuthSetCookie('sid=abc; Path=/; HttpOnly')).toBe(
      'sid=abc; Path=/auth; HttpOnly'
    );
    expect(rewriteProductAuthSetCookie('xsrf=1; path=/device')).toBe('xsrf=1; Path=/auth/device');
    expect(rewriteProductAuthSetCookie('sid=abc; Path=/auth')).toBe('sid=abc; Path=/auth');
    expect(rewriteProductAuthSetCookie('sid=abc; Path=/auth/oidc')).toBe(
      'sid=abc; Path=/auth/oidc'
    );
  });

  it('does not rewrite __Host- cookies', () => {
    const cookie = '__Host-logto-trusted-device=abc; Path=/; Secure';

    expect(rewriteProductAuthSetCookie(cookie)).toBe(cookie);
  });
});
