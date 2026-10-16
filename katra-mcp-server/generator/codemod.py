"""Turn the emitted scaffold into a working server: real auth, tenant addressing, zod 4.

The emitter writes one file per tool with a uniform shape:

    const baseUrl = process.env["KATRA_LOGTO_ADMIN_BASE_URL"] ?? "http://localhost:8000";
    let path = "/api/applications";
    ...
    const resp = await fetch(url.toString(), { ... });

This pass rewrites that shape instead of regenerating it, so the HTTP plumbing (paths, parameter
styles, arg mapping) stays exactly as the generator produced it:

1. drop the stale files from the previous mechanical emit;
2. zod 4: `z.record(z.unknown())` needs a key schema;
3. every handler gets a tenant id (`tenantId`, defaulting to KATRA_LOGTO_TENANT_ID) unless it is a
   control-plane call, resolves its base URL with `baseUrlFor`, and goes through `apiFetch`, which
   attaches a cached client-credentials bearer token for the right Management API audience.
"""
import re
from pathlib import Path

TS = Path(r"C:\Users\jics\.local\share\katra-mcp\out\ts")
TOOLS = TS / "src" / "tools"

CLIENT_TS = r'''/**
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
'''


def rewrite(path: Path) -> str | None:
    source = path.read_text(encoding="utf-8")
    match = re.search(r'let path = "([^"]+)";', source)
    if not match:
        return "no path"
    pattern = match.group(1)
    control_plane = pattern.startswith("/api/tenants")

    # zod 4 needs an explicit key schema
    source = source.replace("z.record(z.unknown())", "z.record(z.string(), z.unknown())")

    # shared transport
    source = source.replace(
        'import { recordCall } from "../telemetry.js";',
        'import { recordCall } from "../telemetry.js";\n'
        'import { apiFetch, baseUrlFor } from "../client.js";',
        1,
    )
    source = source.replace(
        'const baseUrl = process.env["KATRA_LOGTO_ADMIN_BASE_URL"] ?? "http://localhost:8000";',
        f'const baseUrl = await baseUrlFor(params, "{pattern}");',
        1,
    )
    source = source.replace("await fetch(url.toString(), {", "await apiFetch(url, {", 1)
    source = source.replace(
        "headers: hasBody ? { \"Content-Type\": \"application/json\" } : undefined,",
        "headers: hasBody ? { \"Content-Type\": \"application/json\" } : undefined,",
        1,
    )

    if not control_plane:
        if '"tenantId"' not in source:
            source = source.replace(
                "  inputSchema: z.object({\n",
                "  inputSchema: z.object({\n"
                '    "tenantId": z.string().optional().describe('
                '"Tenant id this call targets (path-based multi-tenancy); defaults to the '
                'server\'s KATRA_LOGTO_TENANT_ID."),\n',
                1,
            )
        source = source.replace(
            'if (v == null || k === "verbose") continue;',
            'if (v == null || k === "verbose" || k === "tenantId") continue;',
            1,
        )

    path.write_text(source, encoding="utf-8")
    return None


def main() -> None:
    stale = [p for p in TOOLS.glob("*.ts") if not p.name.startswith("katra_")]
    for p in stale:
        p.unlink()
    print(f"stale files removed: {len(stale)}")

    (TS / "src" / "client.ts").write_text(CLIENT_TS, encoding="utf-8")
    print("client.ts written")

    problems = []
    count = 0
    for p in sorted(TOOLS.glob("katra_*.ts")):
        issue = rewrite(p)
        if issue:
            problems.append((p.name, issue))
        else:
            count += 1
    print(f"rewritten: {count}  problems: {len(problems)}")
    for name, issue in problems[:10]:
        print("  ", name, issue)

    remaining = sum(
        1 for p in TOOLS.glob("katra_*.ts") if 'KATRA_LOGTO_ADMIN_BASE_URL' in p.read_text(encoding="utf-8")
    )
    print(f"handlers still using the raw env base: {remaining}")
    still3 = sum(1 for p in TOOLS.glob("katra_*.ts") if "z.record(z.unknown())" in p.read_text(encoding="utf-8"))
    print(f"handlers still on zod 3 record: {still3}")


if __name__ == "__main__":
    main()
