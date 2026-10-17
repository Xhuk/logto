import { createMockUtils } from '@logto/shared/esm';

import { createContextWithRouteParameters } from '#src/utils/test-utils.js';

import koaBrandLogo, { brandLogoPath, katraLogo, productLogoPath } from './koa-brand-logo.js';

const { jest } = import.meta;

const domain = 'propflow.kairova.services';
const productLogoUrl = `https://${domain}${productLogoPath}`;

const next = jest.fn();

// `createContextWithRouteParameters` copia solo las props propias del contexto; `method` y `host`
// son getters del prototipo de Koa, así que se agregan acá (en un request real siempre existen).
const createContext = (url = brandLogoPath, host = domain) => ({
  ...createContextWithRouteParameters({ url }),
  method: 'GET',
  host,
});

describe('koaBrandLogo', () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch');

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sirve el logo de Katra cuando el producto no publica uno', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));
    const ctx = createContext();

    await koaBrandLogo(domain)(ctx, next);

    expect(ctx.response.get('content-type')).toContain('image/svg+xml');
    expect(ctx.response.get('cache-control')).toBe('public, max-age=3600');
    expect(ctx.body).toBe(katraLogo);
    expect(ctx.redirect).not.toBeCalled();
  });

  it('redirige al logo del producto cuando el host sirve una imagen', async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, { status: 200, headers: { 'content-type': 'image/png' } })
    );
    const ctx = createContext();

    await koaBrandLogo(domain)(ctx, next);

    expect(fetchSpy).toBeCalledWith(productLogoUrl, expect.objectContaining({ redirect: 'follow' }));
    expect(ctx.redirect).toBeCalledWith(productLogoUrl);
  });

  it('cae al logo de Katra cuando el producto contesta su shell HTML con 200', async () => {
    fetchSpy.mockResolvedValue(
      new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    );
    const ctx = createContext();

    await koaBrandLogo(domain)(ctx, next);

    expect(ctx.body).toBe(katraLogo);
    expect(ctx.redirect).not.toBeCalled();
  });

  it('cae al logo de Katra cuando el host no es el dominio registrado del tenant', async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, { status: 200, headers: { 'content-type': 'image/png' } })
    );
    const ctx = createContext(brandLogoPath, 'otro-host.example.com');

    await koaBrandLogo(domain)(ctx, next);

    expect(fetchSpy).not.toBeCalled();
    expect(ctx.body).toBe(katraLogo);
  });

  it('cae al logo de Katra si el producto no responde (timeout o error de red)', async () => {
    fetchSpy.mockRejectedValue(new Error('The operation was aborted'));
    const ctx = createContext();

    await koaBrandLogo(domain)(ctx, next);

    expect(ctx.body).toBe(katraLogo);
  });

  it('deja pasar el resto de las rutas', async () => {
    const ctx = createContext('/sign-in');

    await koaBrandLogo(domain)(ctx, next);

    expect(next).toBeCalled();
    expect(fetchSpy).not.toBeCalled();
    expect(ctx.body).toBeUndefined();
  });
});
