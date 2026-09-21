/**
 * Staff-side map of tenant id → Management API base URL.
 *
 * Product clients use custom domains (`auth.lotly.lat`). The MCP is staff, so it
 * needs the same host when the wildcard `{tenantId}.example.com` is not reachable.
 *
 * Formats:
 * - Comma-separated pairs: `id1=https://auth.lotly.lat,id2=https://auth.vetgroom.services`
 * - JSON object: `{"id1":"https://auth.lotly.lat"}`
 */
export const parseTenantEndpoints = (raw: string | undefined): ReadonlyMap<string, URL> => {
  if (!raw?.trim()) {
    return new Map();
  }

  const trimmed = raw.trim();
  const entries =
    trimmed.startsWith('{') ? parseJsonObject(trimmed) : parseCommaSeparatedPairs(trimmed);
  const result = new Map<string, URL>();

  for (const [tenantId, endpoint] of entries) {
    const id = tenantId.trim();

    if (!id) {
      throw new Error('LOGTO_TENANT_ENDPOINTS contains an empty tenant id.');
    }

    try {
      result.set(id, new URL(endpoint));
    } catch {
      throw new Error(
        `LOGTO_TENANT_ENDPOINTS value for "${id}" is not a valid URL: "${endpoint}".`
      );
    }
  }

  return result;
};

const parseJsonObject = (raw: string): Array<[string, string]> => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('LOGTO_TENANT_ENDPOINTS JSON is invalid.');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LOGTO_TENANT_ENDPOINTS JSON must be an object of tenant id to URL.');
  }

  return Object.entries(parsed).map(([key, value]) => {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`LOGTO_TENANT_ENDPOINTS["${key}"] must be a non-empty URL string.`);
    }

    return [key, value];
  });
};

const parseCommaSeparatedPairs = (raw: string): Array<[string, string]> =>
  raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');

      if (separator <= 0 || separator === part.length - 1) {
        throw new Error(
          `LOGTO_TENANT_ENDPOINTS pair "${part}" must be tenantId=https://host (no spaces around =).`
        );
      }

      return [part.slice(0, separator), part.slice(separator + 1)];
    });

export const parseCommaSeparatedList = (raw: string | undefined): readonly string[] => {
  if (!raw?.trim()) {
    return [];
  }

  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};
