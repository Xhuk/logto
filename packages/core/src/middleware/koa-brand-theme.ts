import { type MiddlewareType } from 'koa';

import { EnvSet } from '#src/env-set/index.js';
import { isTenantHost, normalizeHost } from '#src/middleware/brand-host.js';

/** Convención que publica cada producto en su propio host. */
export const productThemePath = '/brand/theme.css';

/** El producto no puede colgar el login: si no responde rápido, la pantalla sale sin su tema. */
const productFetchTimeout = 500;

/**
 * Un theme es CSS de tokens y detalles, no un bundle: si pasa de acá probablemente sea el theme
 * entero de la app (Tailwind, reset), que rompe los tokens de la experiencia.
 */
const maxThemeBytes = 64 * 1024;

/** Un theme publicado tarda hasta cinco minutos en verse; uno retirado, uno en dejar de verse. */
const positiveTtl = 5 * 60 * 1000;
const negativeTtl = 60 * 1000;

type CacheEntry = { css?: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | undefined>>();

/** Sólo para tests: la cache vive en el módulo y sobrevive entre casos. */
export const clearProductThemeCache = () => {
  cache.clear();
  inFlight.clear();
};

/**
 * El theme del producto, si lo publica: `https://<su host>/brand/theme.css`.
 *
 * Se inyecta **después** del `customCss` del tenant, así el producto puede pisar lo suyo sin que el
 * tenant pierda el resto. Sólo se consulta cuando el `Host` es el dominio registrado del tenant (mismo
 * criterio que el logo: un request por path no debe disparar fetches a hosts arbitrarios), se acepta
 * únicamente `content-type: text/css` —un SPA contesta su shell HTML con 200 a cualquier ruta— y
 * cualquier falla deja la pantalla como estaba. No es un error de login, igual que el logo.
 */
const getProductTheme = async ({
  host,
  customDomain,
}: {
  host?: string;
  customDomain?: string;
}): Promise<string | undefined> => {
  if (!isTenantHost(host, customDomain) || host === undefined) {
    return;
  }

  const tenantHost = normalizeHost(host);
  const cached = cache.get(tenantHost);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.css;
  }

  const pending = inFlight.get(tenantHost);

  if (pending) {
    return pending;
  }

  const request = (async () => {
    const css = await fetchProductTheme(tenantHost);

    cache.set(tenantHost, {
      css,
      expiresAt: Date.now() + (css ? positiveTtl : negativeTtl),
    });

    return css;
  })();

  inFlight.set(tenantHost, request);

  try {
    return await request;
  } finally {
    inFlight.delete(tenantHost);
  }
};

const fetchProductTheme = async (tenantHost: string): Promise<string | undefined> => {
  try {
    const response = await fetch(`https://${tenantHost}${productThemePath}`, {
      headers: { accept: 'text/css' },
      redirect: 'follow',
      signal: AbortSignal.timeout(productFetchTimeout),
    });

    if (!response.ok) {
      return undefined;
    }

    // Un SPA suele contestar 200 con su shell HTML a cualquier path: sólo vale si es CSS.
    if (!response.headers.get('content-type')?.startsWith('text/css')) {
      return undefined;
    }

    const css = await response.text();

    if (css.trim().length === 0 || css.length > maxThemeBytes) {
      return undefined;
    }

    return css;
  } catch {
    return undefined;
  }
};

/**
 * `</style` dentro del CSS cerraría el elemento antes de tiempo y lo que sigue se parsearía como HTML,
 * igual que con el `customCss` del tenant: se neutraliza dejando `<\/style`, que el motor de CSS
 * vuelve a leer como `</style`.
 */
const escapeStyleContent = (css: string) => css.replaceAll(/<\/(style)/giu, '<\\/$1');

/**
 * Inyecta el theme del producto en el `<head>` del HTML ya servido por la experiencia.
 *
 * Va montado **antes** de `koaExperienceSsr` a propósito: ese middleware inyecta el `customCss` del
 * tenant después de su propio `next()`, así que este corre después y su `<style>` queda el último —
 * que es el orden que se quiere para que el producto pueda pisar al tenant.
 */
export default function koaBrandTheme(customDomain?: string): MiddlewareType {
  return async (ctx, next) => {
    await next();

    if (!EnvSet.values.isBrandThemeEnabled || typeof ctx.body !== 'string') {
      return;
    }

    if (!ctx.body.includes('</head>')) {
      return;
    }

    const css = await getProductTheme({ host: ctx.host, customDomain });

    if (!css) {
      return;
    }

    ctx.body = ctx.body.replace(
      '</head>',
      // Función de reemplazo para que las secuencias `$` del CSS entren verbatim.
      () => `<style data-product-theme>${escapeStyleContent(css)}</style></head>`
    );
  };
}
