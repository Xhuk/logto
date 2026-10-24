import { EnvSet } from '#src/env-set/index.js';
import { createContextWithRouteParameters } from '#src/utils/test-utils.js';

import koaBrandLogo from './koa-brand-logo.js';
import koaBrandTheme, { clearProductThemeCache, productThemePath } from './koa-brand-theme.js';

const { jest } = import.meta;

const domain = 'lotly.lat';
const productThemeUrl = `https://${domain}${productThemePath}`;
const html = '<html><head><style data-custom-css>/* tenant */</style></head><body></body></html>';

/** `koaExperienceSsr` corre adentro de este `next()`; el body ya viene inyectado por `createContext`. */
const next = jest.fn();

// `createContextWithRouteParameters` copia solo las props propias del contexto; `host` es un getter
// del prototipo de Koa, así que se agrega acá (en un request real siempre existe).
const createContext = (host = domain, body: unknown = html) => ({
  ...createContextWithRouteParameters({ url: '/' }),
  host,
  body,
});

const cssResponse = (css: string, contentType = 'text/css') =>
  new Response(css, { status: 200, headers: { 'content-type': contentType } });

describe('koaBrandTheme', () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch');
  const originalIsDevFeaturesEnabled = EnvSet.values.isDevFeaturesEnabled;

  beforeEach(() => {
    clearProductThemeCache();
  });

  afterEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @silverhand/fp/no-mutation -- Restore the feature gate after each case.
    (EnvSet.values as { isDevFeaturesEnabled: boolean }).isDevFeaturesEnabled =
      originalIsDevFeaturesEnabled;
  });

  it('inyecta el theme del producto después del customCss del tenant', async () => {
    fetchSpy.mockResolvedValue(cssResponse('body[class]{--color-neutral-10:#fbf8f3}'));
    const ctx = createContext();

    await koaBrandTheme(domain)(ctx, next);

    expect(fetchSpy).toBeCalledWith(
      productThemeUrl,
      expect.objectContaining({ redirect: 'follow' })
    );
    expect(ctx.body).toContain('<style data-product-theme>body[class]');
    // El del producto va al final: es lo último que puede pisar.
    expect(String(ctx.body).indexOf('data-custom-css')).toBeLessThan(
      String(ctx.body).indexOf('data-product-theme')
    );
    expect(String(ctx.body)).toContain('</style></head>');
  });

  it('no consulta nada cuando el host no es el dominio registrado del tenant', async () => {
    fetchSpy.mockResolvedValue(cssResponse('a{b:c}'));
    const ctx = createContext('otro-host.example.com');

    await koaBrandTheme(domain)(ctx, next);

    expect(fetchSpy).not.toBeCalled();
    expect(ctx.body).toBe(html);
  });

  it('no inyecta nada si el producto no publica el archivo', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));
    const ctx = createContext();

    await koaBrandTheme(domain)(ctx, next);

    expect(ctx.body).toBe(html);
  });

  it('no inyecta nada cuando el producto contesta su shell HTML con 200', async () => {
    fetchSpy.mockResolvedValue(cssResponse('<!doctype html>', 'text/html'));
    const ctx = createContext();

    await koaBrandTheme(domain)(ctx, next);

    expect(ctx.body).toBe(html);
  });

  it('degrada en silencio si el producto no responde', async () => {
    fetchSpy.mockRejectedValue(new Error('The operation was aborted'));
    const ctx = createContext();

    await koaBrandTheme(domain)(ctx, next);

    expect(ctx.body).toBe(html);
  });

  it('descarta un theme más grande que el tope (el theme entero de la app rompe los tokens)', async () => {
    fetchSpy.mockResolvedValue(cssResponse('a{b:c}'.repeat(20_000)));
    const ctx = createContext();

    await koaBrandTheme(domain)(ctx, next);

    expect(ctx.body).toBe(html);
  });

  it('neutraliza `</style` para que el CSS no cierre el elemento', async () => {
    fetchSpy.mockResolvedValue(cssResponse('a{background:url("</style><script>x</script>")}'));
    const ctx = createContext();

    await koaBrandTheme(domain)(ctx, next);

    expect(ctx.body).toContain('<\\/style>');
    expect(String(ctx.body).match(/<\/style>/gu)).toHaveLength(2); // El del tenant y el del theme
  });

  it('cachea el theme y no vuelve a pedirlo', async () => {
    fetchSpy.mockResolvedValue(cssResponse('a{b:c}'));

    await koaBrandTheme(domain)(createContext(), next);
    await koaBrandTheme(domain)(createContext(), next);

    expect(fetchSpy).toBeCalledTimes(1);
  });

  it('cachea también el "no hay", para no pagar el timeout en cada render', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));

    await koaBrandTheme(domain)(createContext(), next);
    await koaBrandTheme(domain)(createContext(), next);

    expect(fetchSpy).toBeCalledTimes(1);
  });

  it('acepta el endpoint del producto con esquema y /auth', async () => {
    fetchSpy.mockResolvedValue(cssResponse('a{b:c}'));
    const ctx = createContext();

    await koaBrandTheme(`https://${domain}/auth`)(ctx, next);

    expect(fetchSpy).toBeCalledWith(
      productThemeUrl,
      expect.objectContaining({ redirect: 'follow' })
    );
    expect(ctx.body).toContain('data-product-theme');
  });

  it('no hace nada cuando el gate está apagado', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation -- Toggle the gate for this case only.
    (EnvSet.values as { isDevFeaturesEnabled: boolean }).isDevFeaturesEnabled = false;
    fetchSpy.mockResolvedValue(cssResponse('a{b:c}'));
    const ctx = createContext();

    await koaBrandTheme(domain)(ctx, next);

    expect(fetchSpy).not.toBeCalled();
    expect(ctx.body).toBe(html);
  });

  it('deja pasar respuestas que no son HTML', async () => {
    fetchSpy.mockResolvedValue(cssResponse('a{b:c}'));
    const symbol = Symbol('json');
    const ctx = createContext(domain, symbol);

    await koaBrandTheme(domain)(ctx, next);

    expect(fetchSpy).not.toBeCalled();
    expect(ctx.body).toBe(symbol);
  });

  // `Tenant.create` monta el logo, no el theme: la composición tiene que salir de ahí.
  it('lo monta el middleware de marca que ya monta el tenant', async () => {
    fetchSpy.mockResolvedValue(cssResponse('a{b:c}'));
    const ctx = createContext();

    await koaBrandLogo(domain)(ctx, next);

    expect(ctx.body).toContain('data-product-theme');
  });
});
