/**
 * Tool: katra_update_admin_console_config
 * Partially update the admin console configuration for the current tenant, changing only the fields supplied. Returns the updated admin console config.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_update_admin_console_config",
  description: "Partially update the admin console configuration for the current tenant, changing only the fields supplied. Returns the updated admin console config.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "signInExperienceCustomized": z.boolean().optional().describe("Set true or false to mark whether the sign-in experience has been customized."),
    "organizationCreated": z.boolean().optional().describe("Set true or false to mark whether an organization has been created."),
    "developmentTenantMigrationNotification": z.record(z.string(), z.unknown()).optional().describe("Notification state object for the development tenant migration notice."),
    "checkedChargeNotification": z.record(z.string(), z.unknown()).optional().describe("Notification state object tracking whether the charge notice has been checked."),
    "verbose": z.boolean().optional().describe("Set true to return the full nested config after updating; omit for the default."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/configs/admin-console");
    let path = "/api/configs/admin-console";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"signInExperienceCustomized": {"style": "body", "apiName": "signInExperienceCustomized"}, "organizationCreated": {"style": "body", "apiName": "organizationCreated"}, "developmentTenantMigrationNotification": {"style": "body", "apiName": "developmentTenantMigrationNotification"}, "checkedChargeNotification": {"style": "body", "apiName": "checkedChargeNotification"}};
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
    recordCall("katra_update_admin_console_config", Date.now() - start, "ok");
  }
};
