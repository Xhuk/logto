import * as z from 'zod/v4';

import { parseCommaSeparatedList, parseTenantEndpoints } from './tenant-endpoints.js';

/** Default Logto Management API resource indicator for the control plane (used as the audience). */
const defaultManagementApiResource = 'https://default.logto.app/api';

/**
 * Default per-tenant templates. Logto derives a tenant's endpoint and Management API resource
 * indicator from its ID. Override these when your deployment uses custom domains.
 *
 * Placeholders: `{tenantId}`.
 */
const defaultTenantEndpointTemplate = 'https://{tenantId}.logto.app';
const defaultTenantResourceTemplate = 'https://{tenantId}.logto.app/api';

const defaultHttpHost = '127.0.0.1';
const defaultHttpPort = 3301;
const defaultOauthScope = 'mcp:all';

const environmentGuard = z.object({
  LOGTO_ENDPOINT: z.string().min(1),
  LOGTO_MCP_CLIENT_ID: z.string().min(1).optional(),
  LOGTO_MCP_CLIENT_SECRET: z.string().min(1).optional(),
  LOGTO_APP_ID: z.string().min(1).optional(),
  LOGTO_APP_SECRET: z.string().min(1).optional(),
  LOGTO_MCP_RESOURCE: z.string().min(1).optional(),
  LOGTO_API_INDICATOR: z.string().min(1).optional(),
  LOGTO_MCP_SCOPE: z.string().min(1).optional(),
  LOGTO_TENANT_ENDPOINT_TEMPLATE: z.string().min(1).optional(),
  LOGTO_TENANT_RESOURCE_TEMPLATE: z.string().min(1).optional(),
  LOGTO_TENANT_ENDPOINTS: z.string().optional(),
  MCP_HTTP_PORT: z.string().optional(),
  MCP_HTTP_HOST: z.string().optional(),
  MCP_PUBLIC_URL: z.string().min(1).optional(),
  MCP_OAUTH_RESOURCE: z.string().min(1).optional(),
  MCP_OAUTH_SCOPES: z.string().min(1).optional(),
  /** Extra Host header names Traefik/Tailscale may send (comma-separated). */
  MCP_ALLOWED_HOSTNAMES: z.string().optional(),
  LOGTO_OIDC_ISSUER: z.string().min(1).optional(),
  LOGTO_MCP_ALLOWED_SUBJECTS: z.string().optional(),
});

export type HttpModeConfig = {
  host: string;
  port: number;
  /** Public MCP URL Cursor calls, e.g. `https://auth.kairova.services/mcp`. */
  publicUrl: URL;
  /** RFC 8707 resource indicator; must match the access token `aud`. */
  oauthResource: string;
  oauthScopes: readonly string[];
  issuer: string;
  /** Additional allowed Host header values beyond publicUrl.hostname and loopback. */
  allowedHostnames: readonly string[];
};

export type LogtoMcpConfig = {
  /** Base endpoint that serves the Management API (admin tenant in multi-tenant setups). */
  endpoint: URL;
  clientId: string;
  clientSecret: string;
  /** Management API resource indicator for the control plane (M2M audience). */
  resource: string;
  /** Space-separated scopes to request for the Management API. */
  scope: string;
  /** Template for a tenant's base URL, with `{tenantId}` as placeholder. */
  tenantEndpointTemplate: string;
  /** Template for a tenant's Management API resource indicator. */
  tenantResourceTemplate: string;
  /** Staff overrides: tenant id → custom-domain Management API base. */
  tenantEndpoints: ReadonlyMap<string, URL>;
  /** When set, serve Streamable HTTP + OAuth instead of stdio. */
  http: HttpModeConfig | undefined;
  /** If non-empty, HTTP tokens must have one of these `sub` values. */
  allowedSubjects: readonly string[];
};

/** Build a string from a `{tenantId}` template. */
export const applyTenantTemplate = (template: string, tenantId: string): string =>
  template.replaceAll('{tenantId}', tenantId);

export const resolveTenantEndpoint = (config: LogtoMcpConfig, tenantId: string): URL => {
  const endpoint =
    config.tenantEndpoints.get(tenantId) ??
    new URL(applyTenantTemplate(config.tenantEndpointTemplate, tenantId));

  // Path-based tenants (`https://host/{tenantId}`) must keep the trailing slash.
  // `new URL('api/applications', 'https://host/3ni0yi')` otherwise drops the tenant segment.
  if (!endpoint.pathname.endsWith('/')) {
    endpoint.pathname = `${endpoint.pathname}/`;
  }

  return endpoint;
};

const parsePort = (raw: string | undefined): number | undefined => {
  if (!raw?.trim()) {
    return undefined;
  }

  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`MCP_HTTP_PORT must be an integer 1–65535, received "${raw}".`);
  }

  return port;
};

const parseUrl = (raw: string, label: string): URL => {
  try {
    return new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL, received "${raw}".`);
  }
};

/**
 * Cursor compares the protected-resource metadata `resource` to the `url` in mcp.json
 * (or the origin). A trailing slash on a path (`/mcp/` vs `/mcp`) fails before the OAuth card.
 */
const resourceIndicator = (url: URL): string => {
  if (url.pathname === '/' || url.pathname === '') {
    return url.origin;
  }

  return `${url.origin}${url.pathname.replace(/\/$/, '')}${url.search}`;
};

/**
 * Read and validate configuration from the environment.
 *
 * Secrets are read from environment variables only, never from code, and validated at startup so
 * misconfiguration fails fast with actionable messages.
 */
export const loadConfig = (environment: NodeJS.ProcessEnv = process.env): LogtoMcpConfig => {
  const result = environmentGuard.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration. Required: LOGTO_ENDPOINT, and either ` +
        `LOGTO_MCP_CLIENT_ID/LOGTO_MCP_CLIENT_SECRET or LOGTO_APP_ID/LOGTO_APP_SECRET.\n${details}`
    );
  }

  const env = result.data;
  const clientId = env.LOGTO_MCP_CLIENT_ID ?? env.LOGTO_APP_ID;
  const clientSecret = env.LOGTO_MCP_CLIENT_SECRET ?? env.LOGTO_APP_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Management API machine-to-machine credentials. Set LOGTO_MCP_CLIENT_ID and ' +
        'LOGTO_MCP_CLIENT_SECRET (aliases: LOGTO_APP_ID / LOGTO_APP_SECRET). These stay on the ' +
        'server; Cursor OAuth does not use them.'
    );
  }

  const endpoint = parseUrl(env.LOGTO_ENDPOINT, 'LOGTO_ENDPOINT');
  const httpPort = parsePort(env.MCP_HTTP_PORT);

  let http: HttpModeConfig | undefined;

  if (httpPort !== undefined) {
    const host = env.MCP_HTTP_HOST?.trim() || defaultHttpHost;
    const publicUrl = parseUrl(
      env.MCP_PUBLIC_URL ?? `http://${host}:${httpPort}/mcp`,
      'MCP_PUBLIC_URL'
    );
    const oauthResource = resourceIndicator(
      env.MCP_OAUTH_RESOURCE
        ? parseUrl(env.MCP_OAUTH_RESOURCE, 'MCP_OAUTH_RESOURCE')
        : publicUrl
    );
    const issuer = env.LOGTO_OIDC_ISSUER ?? new URL('/oidc', endpoint).href.replace(/\/$/, '');
    parseUrl(issuer, 'LOGTO_OIDC_ISSUER');

    http = {
      host,
      port: httpPort,
      publicUrl,
      oauthResource,
      oauthScopes: parseCommaSeparatedList(env.MCP_OAUTH_SCOPES).length
        ? parseCommaSeparatedList(env.MCP_OAUTH_SCOPES)
        : [defaultOauthScope],
      issuer,
      allowedHostnames: parseCommaSeparatedList(env.MCP_ALLOWED_HOSTNAMES),
    };
  }

  return {
    endpoint,
    clientId,
    clientSecret,
    resource: env.LOGTO_MCP_RESOURCE ?? env.LOGTO_API_INDICATOR ?? defaultManagementApiResource,
    scope: env.LOGTO_MCP_SCOPE ?? 'all',
    tenantEndpointTemplate: env.LOGTO_TENANT_ENDPOINT_TEMPLATE ?? defaultTenantEndpointTemplate,
    tenantResourceTemplate: env.LOGTO_TENANT_RESOURCE_TEMPLATE ?? defaultTenantResourceTemplate,
    tenantEndpoints: parseTenantEndpoints(env.LOGTO_TENANT_ENDPOINTS),
    http,
    allowedSubjects: parseCommaSeparatedList(env.LOGTO_MCP_ALLOWED_SUBJECTS),
  };
};

export const cursorRedirectUris = [
  'http://localhost:8787/callback',
  'https://www.cursor.com/agents/mcp/oauth/callback',
  'cursor://anysphere.cursor-mcp/oauth/callback',
] as const;

export { defaultHttpPort, defaultOauthScope };
