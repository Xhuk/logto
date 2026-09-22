import {
  controlPlaneAdminRole,
  getAccessSubject,
  samePerson,
  type LoginIdentity,
  type TenantUser,
} from './access.js';
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
type RoleRecord = { name: string };

export class LogtoClient {
  readonly #tokens = new Map<string, CachedToken>();
  readonly #controlPlaneAdmins = new Map<string, boolean>();
  readonly #loginProfiles = new Map<string, LoginIdentity>();
  readonly #tenantAdmins = new Map<string, boolean>();

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
    target: { base?: URL; resource?: string; tenantId?: string; skipAuthorize?: boolean } = {}
  ): Promise<T> {
    if (!target.skipAuthorize) {
      await this.#authorize(path, target.tenantId);
    }

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

    return this.request<T>(path, init, { base, resource, tenantId });
  }

  /** Base URL of a tenant, with a trailing slash. */
  tenantEndpoint(tenantId: string): URL {
    return resolveTenantEndpoint(this.config, tenantId);
  }

  /** Management API audience (`aud`) for a tenant. */
  managementResource(tenantId: string): string {
    return applyTenantTemplate(this.config.tenantResourceTemplate, tenantId);
  }

  /**
   * OAuth scope for this request. Control-plane admin configures every tenant.
   * A tenant admin configures only the tenants where that same person holds `default:admin`.
   * Stdio has no OAuth login.
   */
  async accessScope(): Promise<
    | { mode: 'stdio' }
    | { mode: 'control-plane'; subject: string }
    | { mode: 'tenant-admin'; subject: string; tenantIds: string[] }
  > {
    const subject = getAccessSubject();

    if (!subject) {
      return { mode: 'stdio' };
    }

    if (await this.#isControlPlaneAdmin(subject)) {
      return { mode: 'control-plane', subject };
    }

    const tenants = await this.request<{ id: string }[]>('api/tenants', {}, { skipAuthorize: true });
    const tenantIds: string[] = [];

    for (const tenant of tenants) {
      if (await this.#isTenantAdmin(subject, tenant.id)) {
        tenantIds.push(tenant.id);
      }
    }

    return { mode: 'tenant-admin', subject, tenantIds };
  }

  /**
   * The control-plane admin sees every tenant. Anyone else only sees tenants where that
   * same person holds the admin role.
   */
  async visibleTenants<T extends { id: string }>(tenants: readonly T[]): Promise<T[]> {
    const subject = getAccessSubject();

    if (!subject || (await this.#isControlPlaneAdmin(subject))) {
      return [...tenants];
    }

    const visible: T[] = [];

    for (const tenant of tenants) {
      if (await this.#isTenantAdmin(subject, tenant.id)) {
        visible.push(tenant);
      }
    }

    return visible;
  }

  async #authorize(path: string, tenantId: string | undefined): Promise<void> {
    const subject = getAccessSubject();

    // Stdio has no Cursor login. HTTP always does, and that login is the authority.
    if (!subject) {
      return;
    }

    if (await this.#isControlPlaneAdmin(subject)) {
      return;
    }

    const scopedTenant = tenantId ?? /^api\/tenants\/([^/?]+)/.exec(path)?.[1];

    if (scopedTenant && (await this.#isTenantAdmin(subject, scopedTenant))) {
      return;
    }

    throw new LogtoApiError(
      403,
      'This OAuth login can only configure tenants where that person is admin. A control-plane admin configures every tenant.'
    );
  }

  async #isControlPlaneAdmin(subject: string): Promise<boolean> {
    const cached = this.#controlPlaneAdmins.get(subject);

    if (cached !== undefined) {
      return cached;
    }

    const allowed = await this.#hasRole(
      `api/users/${encodeURIComponent(subject)}/roles`,
      controlPlaneAdminRole
    );
    this.#controlPlaneAdmins.set(subject, allowed);

    return allowed;
  }

  async #isTenantAdmin(subject: string, tenantId: string): Promise<boolean> {
    const cacheKey = `${subject}\n${tenantId}`;
    const cached = this.#tenantAdmins.get(cacheKey);

    if (cached !== undefined) {
      return cached;
    }

    const allowed = await this.#personIsTenantAdmin(subject, tenantId);
    this.#tenantAdmins.set(cacheKey, allowed);

    return allowed;
  }

  async #personIsTenantAdmin(subject: string, tenantId: string): Promise<boolean> {
    if (await this.#userHasAdminRole(subject, tenantId)) {
      return true;
    }

    const login = await this.#loginProfile(subject);
    const base = resolveTenantEndpoint(this.config, tenantId);
    const resource = applyTenantTemplate(this.config.tenantResourceTemplate, tenantId);
    const queries = [login.email, login.username].filter((value): value is string => Boolean(value));

    for (const search of queries) {
      const users = await this.request<TenantUser[]>(
        `api/users?search=${encodeURIComponent(search)}&page_size=20`,
        {},
        { base, resource, skipAuthorize: true }
      );

      for (const user of users) {
        if (!samePerson(login, user) || user.id === subject) {
          continue;
        }

        if (await this.#userHasAdminRole(user.id, tenantId)) {
          return true;
        }
      }
    }

    return false;
  }

  async #loginProfile(subject: string): Promise<LoginIdentity> {
    const cached = this.#loginProfiles.get(subject);

    if (cached) {
      return cached;
    }

    try {
      const user = await this.request<TenantUser>(
        `api/users/${encodeURIComponent(subject)}`,
        {},
        { skipAuthorize: true }
      );
      const profile = {
        id: subject,
        username: user.username ?? undefined,
        email: user.primaryEmail ?? undefined,
      };
      this.#loginProfiles.set(subject, profile);

      return profile;
    } catch (error: unknown) {
      if (error instanceof LogtoApiError && (error.status === 404 || error.status === 403)) {
        const profile = { id: subject };
        this.#loginProfiles.set(subject, profile);

        return profile;
      }

      throw error;
    }
  }

  async #userHasAdminRole(userId: string, tenantId: string): Promise<boolean> {
    const base = resolveTenantEndpoint(this.config, tenantId);
    const resource = applyTenantTemplate(this.config.tenantResourceTemplate, tenantId);

    return this.#hasRole(
      `api/users/${encodeURIComponent(userId)}/roles`,
      controlPlaneAdminRole,
      { base, resource }
    );
  }

  async #hasRole(
    path: string,
    roleName: string,
    target: { base: URL; resource: string } | undefined = undefined
  ): Promise<boolean> {
    try {
      const roles = await this.request<RoleRecord[]>(path, {}, {
        ...target,
        skipAuthorize: true,
      });

      return roles.some((role) => role.name === roleName);
    } catch (error: unknown) {
      if (error instanceof LogtoApiError && (error.status === 404 || error.status === 403)) {
        return false;
      }

      throw error;
    }
  }
}
