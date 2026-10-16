/**
 * Tool: katra_update_application_sign_in_experience
 * Replace the entire application-level sign-in experience for one application with the supplied values. This is a full overwrite: fields left out are cleared rather than kept, and the saved configuration is returned.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_update_application_sign_in_experience",
  description: "Replace the entire application-level sign-in experience for one application with the supplied values. This is a full overwrite: fields left out are cleared rather than kept, and the saved configuration is returned.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "applicationId": z.string().describe("Id of the application whose sign-in experience to overwrite."),
    "color": z.record(z.string(), z.unknown()).optional().describe("Color palette, e.g. {\"primaryColor\":\"#0055ff\",\"isDarkModeEnabled\":false,\"dark\":{...}}."),
    "branding": z.record(z.string(), z.unknown()).optional().describe("Branding assets such as {\"logoUrl\":\"https://...\",\"faviconUrl\":\"https://...\",\"darkLogoUrl\":\"https://...\"}."),
    "customCss": z.string().optional().describe("Raw CSS injected into this application's sign-in pages."),
    "displayName": z.string().optional().describe("Product name shown on this application's sign-in pages."),
    "termsOfUseUrl": z.record(z.string(), z.unknown()).describe("Terms-of-use link, keyed by language, e.g. {\"en\":\"https://example.com/terms\"}; required, pass null to unset."),
    "privacyPolicyUrl": z.record(z.string(), z.unknown()).describe("Privacy-policy link, keyed by language, e.g. {\"en\":\"https://example.com/privacy\"}; required, pass null to unset."),
    "verbose": z.boolean().optional().describe("Return full payload when true."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/applications/{applicationId}/sign-in-experience");
    let path = "/api/applications/{applicationId}/sign-in-experience";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"applicationId": {"style": "path", "apiName": "applicationId"}, "color": {"style": "body", "apiName": "color"}, "branding": {"style": "body", "apiName": "branding"}, "customCss": {"style": "body", "apiName": "customCss"}, "displayName": {"style": "body", "apiName": "displayName"}, "termsOfUseUrl": {"style": "body", "apiName": "termsOfUseUrl"}, "privacyPolicyUrl": {"style": "body", "apiName": "privacyPolicyUrl"}};
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
      method: "PUT",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(bodyFields) : undefined,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const result = await resp.json();
    const payload = params.verbose ? { data: result, _meta: { status: resp.status } } : compact(result);
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], structuredContent: payload };
  } finally {
    recordCall("katra_update_application_sign_in_experience", Date.now() - start, "ok");
  }
};
