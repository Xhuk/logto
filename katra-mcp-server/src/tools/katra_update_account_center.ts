/**
 * Tool: katra_update_account_center
 * Patch the tenant's account center settings; only the parameters supplied are changed, everything else stays as is. Use this to enable or disable the account center page, pick which profile fields render, brand it with custom CSS, or point the delete-account flow at an external URL. Returns the updated settings.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_update_account_center",
  description: "Patch the tenant's account center settings; only the parameters supplied are changed, everything else stays as is. Use this to enable or disable the account center page, pick which profile fields render, brand it with custom CSS, or point the delete-account flow at an external URL. Returns the updated settings.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "enabled": z.boolean().optional().describe("true to turn the account center page on, false to disable it for all users."),
    "fields": z.record(z.string(), z.unknown()).optional().describe("Object mapping account center field keys (for example name, avatar, email, phone, password, username) to their visibility or editability settings."),
    "webauthnRelatedOrigins": z.array(z.unknown()).optional().describe("Array of origins permitted to use passkeys/WebAuthn from this account center, given as full origin strings such as \"https://example.com\"."),
    "deleteAccountUrl": z.record(z.string(), z.unknown()).optional().describe("Object describing the external account-deletion redirect, typically a url string and whether it is enabled."),
    "customCss": z.string().optional().describe("Raw CSS injected into the account center page to restyle it; send an empty string to remove existing custom CSS."),
    "profileFields": z.array(z.unknown()).optional().describe("Array defining the ordered profile fields and their settings to expose in the account center; this replaces the existing list."),
    "verbose": z.boolean().optional().describe("Set true to return the full expanded settings document in the response; defaults to false."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/account-center");
    let path = "/api/account-center";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"enabled": {"style": "body", "apiName": "enabled"}, "fields": {"style": "body", "apiName": "fields"}, "webauthnRelatedOrigins": {"style": "body", "apiName": "webauthnRelatedOrigins"}, "deleteAccountUrl": {"style": "body", "apiName": "deleteAccountUrl"}, "customCss": {"style": "body", "apiName": "customCss"}, "profileFields": {"style": "body", "apiName": "profileFields"}};
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
    recordCall("katra_update_account_center", Date.now() - start, "ok");
  }
};
