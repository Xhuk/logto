/**
 * Tool: katra_update_organization
 * Update an organization by id; only the fields supplied are changed, everything else is preserved. Returns the updated organization.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_update_organization",
  description: "Update an organization by id; only the fields supplied are changed, everything else is preserved. Returns the updated organization.",
  inputSchema: z.object({
    "id": z.string().describe("Id of the organization to update."),
    "tenantId": z.string().optional().describe("Target tenant id; omit to use the tenant bound to the current session."),
    "name": z.string().optional().describe("New display name for the organization; must be unique within the tenant."),
    "description": z.string().optional().describe("New description for the organization."),
    "customData": z.record(z.string(), z.unknown()).optional().describe("New JSON object replacing the organization's custom data."),
    "isMfaRequired": z.boolean().optional().describe("Set true to require multi-factor authentication for members of this organization."),
    "isTrustedDeviceAllowed": z.boolean().optional().describe("Set true to let members skip MFA on trusted devices."),
    "color": z.record(z.string(), z.unknown()).optional().describe("JSON object with branding color settings, e.g. {\"primaryColor\":\"#0057ff\",\"isDarkModeEnabled\":false}."),
    "branding": z.record(z.string(), z.unknown()).optional().describe("JSON object with branding assets such as logoUrl and darkLogoUrl."),
    "customCss": z.string().optional().describe("Raw CSS applied to the sign-in experience when this organization is the active one."),
    "createdAt": z.number().optional().describe("Creation timestamp in milliseconds since epoch; normally left unchanged."),
    "verbose": z.boolean().optional().describe("Set true to return the full updated organization object instead of a minimal reference; defaults to false."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/organizations/{id}");
    let path = "/api/organizations/{id}";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"id": {"style": "path", "apiName": "id"}, "tenantId": {"style": "body", "apiName": "tenantId"}, "name": {"style": "body", "apiName": "name"}, "description": {"style": "body", "apiName": "description"}, "customData": {"style": "body", "apiName": "customData"}, "isMfaRequired": {"style": "body", "apiName": "isMfaRequired"}, "isTrustedDeviceAllowed": {"style": "body", "apiName": "isTrustedDeviceAllowed"}, "color": {"style": "body", "apiName": "color"}, "branding": {"style": "body", "apiName": "branding"}, "customCss": {"style": "body", "apiName": "customCss"}, "createdAt": {"style": "body", "apiName": "createdAt"}};
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
    recordCall("katra_update_organization", Date.now() - start, "ok");
  }
};
