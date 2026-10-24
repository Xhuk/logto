/**
 * El dominio registrado del tenant, normalizado a hostname.
 *
 * Tres piezas de marca del producto (logo, theme y cualquier futura) tienen que decidir "¿este request
 * es del host del producto?" con el mismo criterio, así que la comparación vive en un solo lugar.
 */
export const normalizeHost = (value: string) => {
  const trimmed = value.trim().toLowerCase().replace(/:\d+$/u, '');

  try {
    return new URL(trimmed).hostname;
  } catch {
    return trimmed;
  }
};

/**
 * `customDomain` llega desde `Tenant.create` como **endpoint del producto**
 * (`https://host/auth`), no como host pelado; también acepta un host suelto. Se compara
 * siempre por hostname, o el match nunca acierta y la marca del producto no se sirve nunca.
 */
export const isTenantHost = (host: string | undefined, customDomain?: string) => {
  const tenantHost = customDomain === undefined ? undefined : normalizeHost(customDomain);

  return tenantHost !== undefined && host !== undefined && normalizeHost(host) === tenantHost;
};
