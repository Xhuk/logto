/**
 * Shared Katra transport: base-URL resolution per tenant, client-credentials tokens with a
 * per-resource cache, and one place that attaches the bearer token.
 *
 * Environment:
 * - KATRA_LOGTO_HOST            path-based host root, e.g. https://katra-imperial.example.ts.net
 * - KATRA_LOGTO_ADMIN_BASE_URL  admin host that serves the control plane, e.g. the same host :8443
 * - KATRA_LOGTO_TENANT_ID       tenant used when a tool call does not pass tenantId
 * - KATRA_LOGTO_TENANT_ENDPOINTS  optional "id=baseUrl,id=baseUrl" staff overrides
 * - KATRA_LOGTO_CLIENT_ID       machine-to-machine application id
 * - KATRA_LOGTO_CLIENT_SECRET   machine-to-machine application secret
 * - KATRA_LOGTO_ADMIN_RESOURCE  admin Management API audience (default https://admin.logto.app/api)
 * - KATRA_LOGTO_RESOURCE_TEMPLATE  per-tenant audience (default https://{tenantId}.logto.app/api)
 * - KATRA_LOGTO_SCOPE           space-separated scopes (default all)
 *
 * Secrets are read from the environment and never logged.
 */

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const host = trimSlash(process.env["KATRA_LOGTO_HOST"] ?? "");
const adminBase = trimSlash(
  process.env["KATRA_LOGTO_ADMIN_BASE_URL"] ?? process.env["KATRA_LOGTO_HOST"] ?? ""
);
const defaultTenant = process.env["KATRA_LOGTO_TENANT_ID"] ?? "";
const adminResource = process.env["KATRA_LOGTO_ADMIN_RESOURCE"] ?? "https://admin.logto.app/api";
const resourceTemplate =
  process.env["KATRA_LOGTO_RESOURCE_TEMPLATE"] ?? "https://{tenantId}.logto.app/api";
const scope = process.env["KATRA_LOGTO_SCOPE"] ?? "all";

const endpoints: Record<string, string> = Object.fromEntries(
  (process.env["KATRA_LOGTO_TENANT_ENDPOINTS"] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, base] = entry.split("=");
      return [id?.trim() ?? "", trimSlash(base?.trim() ?? "")];
    })
    .filter(([id, base]) => Boolean(id) && Boolean(base))
);

/** Control-plane paths live on the admin host and use the admin audience. */
const isControlPlane = (path: string) => path.startsWith("/api/tenants");

const resourceFor = (tenantId: string) =>
  tenantId === "admin" ? adminResource : resourceTemplate.replace("{tenantId}", tenantId);

const tenantFromUrl = (url: URL): string => {
  const [first] = url.pathname.split("/").filter(Boolean);
  return !first || first === "api" ? "admin" : first;
};

/**
 * Base URL for one tool call. Control-plane calls (tenant management) go to the admin host;
 * tenant-scoped calls go to `host/{tenantId}` unless a staff override maps that tenant id.
 */
export async function baseUrlFor(
  params: Record<string, unknown>,
  pattern: string
): Promise<string> {
  if (isControlPlane(pattern)) {
    if (!adminBase) throw new Error("KATRA_LOGTO_ADMIN_BASE_URL is not set");
    return adminBase;
  }

  const tenantId = String(params["tenantId"] ?? defaultTenant ?? "").trim();
  if (!tenantId) {
    throw new Error(
      "No tenant selected: pass tenantId, or set KATRA_LOGTO_TENANT_ID for this server."
    );
  }

  const override = endpoints[tenantId];
  if (override) return override;
  if (tenantId === "admin") {
    if (!adminBase) throw new Error("KATRA_LOGTO_ADMIN_BASE_URL is not set");
    return adminBase;
  }
  if (!host) throw new Error("KATRA_LOGTO_HOST is not set");
  return `${host}/${tenantId}`;
}

type CachedToken = { value: string; expiresAt: number };
const tokens = new Map<string, CachedToken>();
const leewayMs = 30_000;

const fetchToken = async (resource: string): Promise<CachedToken> => {
  const clientId = process.env["KATRA_LOGTO_CLIENT_ID"] ?? "";
  const clientSecret = process.env["KATRA_LOGTO_CLIENT_SECRET"] ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("KATRA_LOGTO_CLIENT_ID / KATRA_LOGTO_CLIENT_SECRET are not set");
  }
  const body = new URLSearchParams({ grant_type: "client_credentials", resource, scope });
  const response = await fetch(`${adminBase}/oidc/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body,
  });
  if (!response.ok) {
    throw new Error(
      `Token request failed with HTTP ${response.status}: ${await response.text()}`
    );
  }
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("Token response carried no access_token");
  return {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
};

/** Access token for a Management API audience, cached until shortly before it expires. */
export async function tokenFor(resource: string): Promise<string> {
  const cached = tokens.get(resource);
  if (cached && cached.expiresAt - leewayMs > Date.now()) return cached.value;
  const fresh = await fetchToken(resource);
  tokens.set(resource, fresh);
  return fresh.value;
}

/**
 * fetch() for Management API calls: picks the audience from the URL (a `/{tenantId}/api/...` path
 * means that tenant; a bare `/api/...` means the admin tenant) and attaches the bearer token.
 */
export async function apiFetch(input: URL, init: RequestInit = {}): Promise<Response> {
  const tenantId = tenantFromUrl(input);
  const resource = resourceFor(tenantId);
  const token = await tokenFor(resource);
  const headers = new Headers(init.headers ?? undefined);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input.toString(), { ...init, headers });
}
