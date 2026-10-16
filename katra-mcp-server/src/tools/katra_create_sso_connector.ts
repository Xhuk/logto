/**
 * Tool: katra_create_sso_connector
 * Create a new enterprise SSO connector for the current tenant from the given provider, returning the created connector record. Supply the provider and connector names plus optional config, domains, branding and profile-sync settings.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_create_sso_connector",
  description: "Create a new enterprise SSO connector for the current tenant from the given provider, returning the created connector record. Supply the provider and connector names plus optional config, domains, branding and profile-sync settings.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "config": z.record(z.string(), z.unknown()).optional().describe("Provider-specific settings object, e.g. client id/secret, issuer or metadata URL, and any provider flags; omit to configure later."),
    "domains": z.array(z.unknown()).optional().describe("Array of email domains (e.g. [\"example.com\"]) that route sign-in to this connector; omit for none."),
    "branding": z.record(z.string(), z.unknown()).optional().describe("Object of display overrides for the connector's sign-in page, such as displayName and logo; omit for defaults."),
    "syncProfile": z.boolean().optional().describe("true to sync each user's profile from the IdP on every sign-in; defaults to false."),
    "enableTokenStorage": z.boolean().optional().describe("true to persist the IdP's access/refresh tokens for later retrieval; defaults to false."),
    "providerName": z.string().describe("Provider identifier from katra_list_sso_connector_providers, e.g. \"SAML\" or \"OIDC\"."),
    "connectorName": z.string().describe("Human-readable name for the connector shown in the console."),
    "verbose": z.boolean().optional().describe("true to return the full connector object including its config; defaults to false."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/sso-connectors");
    let path = "/api/sso-connectors";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"config": {"style": "body", "apiName": "config"}, "domains": {"style": "body", "apiName": "domains"}, "branding": {"style": "body", "apiName": "branding"}, "syncProfile": {"style": "body", "apiName": "syncProfile"}, "enableTokenStorage": {"style": "body", "apiName": "enableTokenStorage"}, "providerName": {"style": "body", "apiName": "providerName"}, "connectorName": {"style": "body", "apiName": "connectorName"}};
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
    recordCall("katra_create_sso_connector", Date.now() - start, "ok");
  }
};
