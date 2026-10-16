/**
 * Tool: katra_update_sso_connector
 * Update an existing SSO connector by id, changing only the fields supplied; omitted fields keep their current values.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_update_sso_connector",
  description: "Update an existing SSO connector by id, changing only the fields supplied; omitted fields keep their current values.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "id": z.string().describe("Id of the SSO connector to update."),
    "config": z.record(z.string(), z.unknown()).optional().describe("Replacement config object for the provider; send the full settings you want stored."),
    "domains": z.array(z.unknown()).optional().describe("Replacement list of email domains for the connector; send an empty array to clear them."),
    "branding": z.record(z.string(), z.unknown()).optional().describe("Replacement branding overrides for the connector's sign-in page."),
    "syncProfile": z.boolean().optional().describe("true to sync user profiles from the IdP on every sign-in, false to stop syncing."),
    "connectorName": z.string().optional().describe("New display name for the connector."),
    "enableTokenStorage": z.boolean().optional().describe("true to persist the IdP's access/refresh tokens, false to stop storing them."),
    "verbose": z.boolean().optional().describe("true to return the updated connector with its full config; defaults to false."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/sso-connectors/{id}");
    let path = "/api/sso-connectors/{id}";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"id": {"style": "path", "apiName": "id"}, "config": {"style": "body", "apiName": "config"}, "domains": {"style": "body", "apiName": "domains"}, "branding": {"style": "body", "apiName": "branding"}, "syncProfile": {"style": "body", "apiName": "syncProfile"}, "connectorName": {"style": "body", "apiName": "connectorName"}, "enableTokenStorage": {"style": "body", "apiName": "enableTokenStorage"}};
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
    recordCall("katra_update_sso_connector", Date.now() - start, "ok");
  }
};
