/**
 * Tool: katra_list_roles
 * List roles in the tenant with paging, optional type filter and the ability to omit roles already held by a given user or application. Returns the matching roles and the total count.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_list_roles",
  description: "List roles in the tenant with paging, optional type filter and the ability to omit roles already held by a given user or application. Returns the matching roles and the total count.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "excludeUserId": z.string().optional().describe("User id whose assigned roles should be filtered out of the results."),
    "excludeApplicationId": z.string().optional().describe("Application id whose assigned roles should be filtered out of the results."),
    "type": z.string().optional().describe("Restrict results to one role type, e.g. 'User' or 'MachineToMachine'."),
    "page": z.number().int().optional().describe("Page number to fetch, starting at 1."),
    "page_size": z.number().int().optional().describe("Number of roles per page; defaults to 20."),
    "search_params": z.record(z.string(), z.unknown()).optional().describe("Filter object applied to the search, e.g. {\"name\":\"admin\"}."),
    "verbose": z.boolean().optional().describe("Set true to return full role objects with their scopes."),
  }),
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/roles");
    let path = "/api/roles";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"excludeUserId": {"style": "query", "apiName": "excludeUserId"}, "excludeApplicationId": {"style": "query", "apiName": "excludeApplicationId"}, "type": {"style": "query", "apiName": "type"}, "page": {"style": "query", "apiName": "page"}, "page_size": {"style": "query", "apiName": "page_size"}, "search_params": {"style": "query", "apiName": "search_params"}};
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
    recordCall("katra_list_roles", Date.now() - start, "ok");
  }
};
