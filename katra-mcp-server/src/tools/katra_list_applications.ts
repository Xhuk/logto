/**
 * Tool: katra_list_applications
 * List applications with pagination, optionally filtered by type, third-party status, or by excluding apps already tied to a role or organization. Returns the matching applications plus the total count.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_list_applications",
  description: "List applications with pagination, optionally filtered by type, third-party status, or by excluding apps already tied to a role or organization. Returns the matching applications plus the total count.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "types": z.record(z.string(), z.unknown()).optional().describe("Array of application types to include, e.g. [\"SPA\",\"Native\",\"MachineToMachine\"]; omit for all types."),
    "excludeRoleId": z.string().optional().describe("Role id; omits applications that already hold this role."),
    "excludeOrganizationId": z.string().optional().describe("Organization id; omits applications already assigned to this organization."),
    "isThirdParty": z.record(z.string(), z.unknown()).optional().describe("Array of booleans such as [true] or [false] to keep only third-party or only first-party applications."),
    "page": z.number().int().optional().describe("1-based page number; defaults to 1."),
    "page_size": z.number().int().optional().describe("Number of applications per page; defaults to 20."),
    "search_params": z.record(z.string(), z.unknown()).optional().describe("Case-insensitive search filter, e.g. {\"name\":\"admin\"}; pass an empty object for no search."),
    "verbose": z.boolean().optional().describe("Return full payload when true."),
  }),
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/applications");
    let path = "/api/applications";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"types": {"style": "query", "apiName": "types"}, "excludeRoleId": {"style": "query", "apiName": "excludeRoleId"}, "excludeOrganizationId": {"style": "query", "apiName": "excludeOrganizationId"}, "isThirdParty": {"style": "query", "apiName": "isThirdParty"}, "page": {"style": "query", "apiName": "page"}, "page_size": {"style": "query", "apiName": "page_size"}, "search_params": {"style": "query", "apiName": "search_params"}};
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
      method: "GET",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(bodyFields) : undefined,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const result = await resp.json();
    const payload = params.verbose ? { data: result, _meta: { status: resp.status } } : compact(result);
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], structuredContent: payload };
  } finally {
    recordCall("katra_list_applications", Date.now() - start, "ok");
  }
};
