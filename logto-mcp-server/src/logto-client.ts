import { applyTenantTemplate, resolveTenantEndpoint, type LogtoMcpConfig } from './config.js';

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
};

/** Error raised for any non-successful Logto API response. */
export class LogtoApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'LogtoApiError';
  }
}

/** Refresh the cached token this many milliseconds before it actually expires. */
const tokenExpiryLeeway = 30_000;

type CachedToken = { value: string; expiresAt: number };

/**
 * Thin Logto Management API client.
 *
 * Authenticates with the OAuth 2.0 client credentials grant (a machine-to-machine application)
 * and caches access tokens per resource indicator until shortly before they expire.
 *
 * Two targets are supported:
 * - The control plane (the configured `LOGTO_ENDPOINT` / `LOGTO_MCP_RESOURCE`), used to manage
 *   tenants.
 * - A specific tenant, addressed by its own endpoint and Management API resource indicator (both
 *   derived from the tenant ID via the configured templates). Logto accepts an admin-tenant token
 *   on user tenants, so one machine-to-machine application can manage every tenant.
 */
export class LogtoClient {
  readonly #tokens = new Map<string, CachedToken>();

  constructor(private readonly config: LogtoMcpConfig) {}

  async #getAccessToken(resource: string): Promise<string> {
    const now = Date.now();
    const cached = this.#tokens.get(resource);

    if (cached && cached.expiresAt - tokenExpiryLeeway > now) {
      return cached.value;
    }

    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      'base64'
    );

    const response = await fetch(new URL('/oidc/token', this.config.endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        resource,
        scope: this.config.scope,
      }),
    });

    const payload = (await response.json().catch(() => undefined)) as TokenResponse | undefined;

    if (!response.ok || !payload?.access_token) {
      throw new LogtoApiError(
        response.status,
        `Failed to obtain an access token from ${this.config.endpoint.href} (HTTP ${response.status}). ` +
          'Check LOGTO_MCP_CLIENT_ID/LOGTO_MCP_CLIENT_SECRET and that the machine-to-machine app can access the Management API resource.'
      );
    }

    this.#tokens.set(resource, {
      value: payload.access_token,
      expiresAt: now + (payload.expires_in ?? 3600) * 1000,
    });

    return payload.access_token;
  }

  async request<T = unknown>(
    path: string,
    init: { method?: string; body?: unknown } = {},
    target: { base?: URL; resource?: string } = {}
  ): Promise<T> {
    const resource = target.resource ?? this.config.resource;
    const accessToken = await this.#getAccessToken(resource);
    const hasBody = init.body !== undefined;

    const response = await fetch(new URL(path, target.base ?? this.config.endpoint), {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let payload: unknown;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
    }

    if (!response.ok) {
      const record =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const code = typeof record.code === 'string' ? record.code : undefined;
      const message =
        typeof record.message === 'string'
          ? record.message
          : `Logto API request failed with HTTP ${response.status}.`;

      throw new LogtoApiError(response.status, message, code);
    }

    return payload as T;
  }

  /** Issue a request against a specific tenant's Management API. */
  async requestForTenant<T = unknown>(
    tenantId: string,
    path: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const base = resolveTenantEndpoint(this.config, tenantId);
    const resource = applyTenantTemplate(this.config.tenantResourceTemplate, tenantId);

    return this.request<T>(path, init, { base, resource });
  }
}
