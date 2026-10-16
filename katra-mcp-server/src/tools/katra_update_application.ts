/**
 * Tool: katra_update_application
 * Update an existing application; only the fields supplied are changed and the updated application is returned. Metadata and custom-data objects are replaced wholesale, so include every key that should remain.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_update_application",
  description: "Update an existing application; only the fields supplied are changed and the updated application is returned. Metadata and custom-data objects are replaced wholesale, so include every key that should remain.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "id": z.string().describe("Id of the application to update."),
    "name": z.string().optional().describe("New display name for the application."),
    "description": z.string().optional().describe("New description; pass an empty string to clear it."),
    "oidcClientMetadata": z.record(z.string(), z.unknown()).optional().describe("Replacement OIDC settings object, e.g. {\"redirectUris\":[...],\"corsAllowedOrigins\":[...]}; keys omitted here are reset to defaults."),
    "customClientMetadata": z.record(z.string(), z.unknown()).optional().describe("Replacement vendor-specific OIDC settings such as token TTLs; include all keys that should survive."),
    "customData": z.record(z.string(), z.unknown()).optional().describe("Replacement arbitrary JSON attached to the application."),
    "appLevelAccessControlEnabled": z.boolean().optional().describe("Set true to enable per-application access control so roles can be scoped to this app."),
    "protectedAppMetadata": z.record(z.string(), z.unknown()).optional().describe("Replacement protected-app settings, e.g. {\"origin\":\"https://example.com\",\"subDomain\":\"app\"}; only meaningful for Protected apps."),
    "isAdmin": z.boolean().optional().describe("Set true to let this application administer the tenant (management privileges); handle with care."),
    "verbose": z.boolean().optional().describe("Return full payload when true."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/applications/{id}");
    let path = "/api/applications/{id}";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"id": {"style": "path", "apiName": "id"}, "name": {"style": "body", "apiName": "name"}, "description": {"style": "body", "apiName": "description"}, "oidcClientMetadata": {"style": "body", "apiName": "oidcClientMetadata"}, "customClientMetadata": {"style": "body", "apiName": "customClientMetadata"}, "customData": {"style": "body", "apiName": "customData"}, "appLevelAccessControlEnabled": {"style": "body", "apiName": "appLevelAccessControlEnabled"}, "protectedAppMetadata": {"style": "body", "apiName": "protectedAppMetadata"}, "isAdmin": {"style": "body", "apiName": "isAdmin"}};
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
      method: "PATCH",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(bodyFields) : undefined,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const result = await resp.json();
    const payload = params.verbose ? { data: result, _meta: { status: resp.status } } : compact(result);
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], structuredContent: payload };
  } finally {
    recordCall("katra_update_application", Date.now() - start, "ok");
  }
};
