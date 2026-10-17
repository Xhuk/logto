import type { MiddlewareType } from 'koa';

/** Ruta del endpoint (dentro del tenant, o sea `/auth/brand/logo` desde afuera). */
export const brandLogoPath = '/brand/logo';

/** Convención que cada producto publica en su propio host; si no existe, se usa el de Katra. */
export const productLogoPath = '/brand/logo.png';

/** El producto no puede colgar el login: si no responde rápido, cae al logo de Katra. */
const productFetchTimeout = 800;

/**
 * Logo de Katra que se sirve como fallback. Va embebido a propósito: no depende del cwd ni del
 * bundle (el contenedor sellado no conserva utilidades de build, y un path relativo se rompe).
 * Misma marca que usa el tenant `admin` en `assets/branding/katra-logo.svg`.
 */
export const katraLogo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stop-color="#151b28" />
      <stop offset="100%" stop-color="#090d16" />
    </radialGradient>
    <linearGradient id="vulcanGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE27D" />
      <stop offset="50%" stop-color="#E5A93C" />
      <stop offset="100%" stop-color="#9E6812" />
    </linearGradient>
    <linearGradient id="katraCore" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#5BF0FF" />
      <stop offset="100%" stop-color="#1A78C2" />
    </linearGradient>
    <filter id="coreGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="500" height="500" rx="90" fill="url(#bgGlow)" stroke="#222f44" stroke-width="3"/>
  <g transform="translate(0, -10)">
    <path d="M 250 85 L 345 285 L 285 260 L 250 330 L 155 285 Z" fill="none" stroke="url(#vulcanGold)" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M 215 175 L 215 315" stroke="url(#vulcanGold)" stroke-width="16" stroke-linecap="round"/>
    <path d="M 215 245 L 285 175" stroke="url(#vulcanGold)" stroke-width="16" stroke-linecap="round"/>
    <path d="M 235 225 L 290 315" stroke="url(#vulcanGold)" stroke-width="16" stroke-linecap="round"/>
    <polygon points="250,215 268,245 250,275 232,245" fill="url(#katraCore)" filter="url(#coreGlow)"/>
  </g>
  <text x="250" y="405" text-anchor="middle" fill="#F0F4F8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" font-size="34" font-weight="800" letter-spacing="9">KATRA</text>
  <text x="250" y="438" text-anchor="middle" fill="#E5A93C" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" letter-spacing="5">IDENTITY PROVIDER</text>
</svg>`;

const normalizeHost = (host: string) =>
  host
    .trim()
    .toLowerCase()
    .replace(/:\d+$/u, '');

/**
 * Sirve el logo de la experiencia de acceso: primero el que publica el producto en
 * `https://<su-host>/brand/logo.png`, y si no existe (o no es una imagen) el de Katra.
 *
 * Existe para que el branding de un tenant no apunte nunca a `logto.io`: el valor queda fijo y
 * el fallback se resuelve en el servidor. Solo se consulta el host cuando es el dominio
 * registrado del tenant, así el endpoint no se convierte en un proxy hacia hosts arbitrarios.
 */
export default function koaBrandLogo(customDomain?: string): MiddlewareType {
  return async (ctx, next) => {
    if (ctx.method !== 'GET' || ctx.path !== brandLogoPath) {
      return next();
    }

    ctx.set('Cache-Control', 'public, max-age=3600');

    const isTenantHost =
      customDomain !== undefined && normalizeHost(ctx.host) === normalizeHost(customDomain);
    const productLogoUrl = isTenantHost ? `https://${customDomain}${productLogoPath}` : undefined;
    const productImage = productLogoUrl ? await fetchProductImage(productLogoUrl) : undefined;

    if (productImage) {
      ctx.redirect(productImage);
      return;
    }

    ctx.set('Content-Type', 'image/svg+xml');
    ctx.body = katraLogo;
  };
}

const fetchProductImage = async (url: string): Promise<string | undefined> => {
  try {
    const response = await fetch(url, {
      headers: { accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(productFetchTimeout),
    });

    if (!response.ok) {
      return undefined;
    }

    // Un SPA suele contestar 200 con su shell HTML a cualquier path: sólo vale si es imagen.
    return response.headers.get('content-type')?.startsWith('image/') ? url : undefined;
  } catch {
    return undefined;
  }
};
