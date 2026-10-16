/**
 * Tool: katra_create_application
 * Create a new application (OIDC client) in the tenant and return it, including its generated id and client credentials. Side effect: a new client id and, for confidential types, a first client secret are issued.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_create_application",
  description: "Create a new application (OIDC client) in the tenant and return it, including its generated id and client credentials. Side effect: a new client id and, for confidential types, a first client secret are issued.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "name": z.string().describe("Human-readable display name for the application; required."),
    "description": z.string().optional().describe("Short description of what the application is for."),
    "type": z.string().describe("Application type; one of Native, SPA, Traditional (server-side web), MachineToMachine, or Protected. Required."),
    "oidcClientMetadata": z.record(z.string(), z.unknown()).optional().describe("OIDC settings, e.g. {\"redirectUris\":[\"https://app.example.com/callback\"],\"postLogoutRedirectUris\":[],\"corsAllowedOrigins\":[]}; sensible defaults are used for omitted keys."),
    "customClientMetadata": z.record(z.string(), z.unknown()).optional().describe("Extra OIDC behaviour such as {\"idTokenTtl\":3600,\"refreshTokenTtlInDays\":14,\"alwaysIssueRefreshToken\":false}."),
    "customData": z.record(z.string(), z.unknown()).optional().describe("Arbitrary JSON stored on the application and returned with it."),
    "isThirdParty": z.boolean().optional().describe("Set true to mark the app as third-party so it is hidden from default listings; defaults to false."),
    "protectedAppMetadata": z.record(z.string(), z.unknown()).optional().describe("Required when type is Protected, e.g. {\"origin\":\"https://example.com\",\"subDomain\":\"app\",\"sessionDuration\":3600}."),
    "verbose": z.boolean().optional().describe("Return full payload when true."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/applications");
    let path = "/api/applications";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"name": {"style": "body", "apiName": "name"}, "description": {"style": "body", "apiName": "description"}, "type": {"style": "body", "apiName": "type"}, "oidcClientMetadata": {"style": "body", "apiName": "oidcClientMetadata"}, "customClientMetadata": {"style": "body", "apiName": "customClientMetadata"}, "customData": {"style": "body", "apiName": "customData"}, "isThirdParty": {"style": "body", "apiName": "isThirdParty"}, "protectedAppMetadata": {"style": "body", "apiName": "protectedAppMetadata"}};
    for (const [k, v] of Object.entries(params)) {
      if (v == null || k === "verbose" || k === "tenantId") continue;
      const meta = paramMeta[k] ?? { style: "query", apiName: k };
      if (meta.style === "path") {
        // Substitute into the path string before constructing URL — the URL
        // constructor percent-encodes "{" and "}" immediately, so a literal
        // "{param}" placeholder no longer exists in .pathname afterward.
        path = path.replace(`{${meta.apiName}}`, encodeURIComponent(String(v)));
      } else if (meta.style === "body") {
        bodyFields[meta.apiName] = v;
      } else {
        queryParams[meta.apiName] = String(v);
      }
    }
    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(queryParams)) {
      url.searchParams.set(k, v);
    }
    for (const [k, v] of Object.entries({})) {
      url.searchParams.set(k, String(v));
    }
    const hasBody = Object.keys(bodyFields).length > 0;
    const resp = await apiFetch(url, {
      method: "POST",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(bodyFields) : undefined,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const result = await resp.json();
    const payload = params.verbose ? { data: result, _meta: { status: resp.status } } : compact(result);
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], structuredContent: payload };
  } finally {
    recordCall("katra_create_application", Date.now() - start, "ok");
  }
};
