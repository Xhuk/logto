import type { LogtoMcpConfig } from './config.js';

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

/**
 * Thin Logto Management API client.
 *
 * Authenticates with the OAuth 2.0 client credentials grant (a machine-to-machine application)
 * and caches the access token until shortly before it expires. Every request uses the token's
 * `resource` (audience) so a single client can target the Management API of the configured
 * tenant.
 */
export class LogtoClient {
  #accessToken?: { value: string; expiresAt: number };

  constructor(private readonly config: LogtoMcpConfig) {}

  async #getAccessToken(): Promise<string> {
    const now = Date.now();

    if (this.#accessToken && this.#accessToken.expiresAt - tokenExpiryLeeway > now) {
      return this.#accessToken.value;
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
        resource: this.config.resource,
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

    this.#accessToken = {
      value: payload.access_token,
      expiresAt: now + (payload.expires_in ?? 3600) * 1000,
    };

    return payload.access_token;
  }

  async request<T = unknown>(
    path: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const accessToken = await this.#getAccessToken();
    const hasBody = init.body !== undefined;

    const response = await fetch(new URL(path, this.config.endpoint), {
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
    const payload: unknown = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const code = typeof record.code === 'string' ? record.code : undefined;
      const message =
        typeof record.message === 'string'
          ? record.message
          : `Logto API request failed with HTTP ${response.status}.`;

      throw new LogtoApiError(response.status, message, code);
    }

    return payload as T;
  }
}
