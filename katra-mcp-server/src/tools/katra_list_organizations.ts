/**
 * Tool: katra_list_organizations
 * List the organizations in the tenant, newest first, with optional text search and filtering to featured organizations. Returns a paginated list.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_list_organizations",
  description: "List the organizations in the tenant, newest first, with optional text search and filtering to featured organizations. Returns a paginated list.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "q": z.string().optional().describe("Free-text search string matched against organization name or description."),
    "showFeatured": z.string().optional().describe("Pass \"true\" to return only featured organizations, \"false\" for only non-featured ones; omit to return both."),
    "page": z.number().int().optional().describe("1-based page number to return; defaults to 1."),
    "page_size": z.number().int().optional().describe("Number of organizations per page; defaults to 20."),
    "verbose": z.boolean().optional().describe("Set true to include additional fields in each returned record; defaults to false."),
  }),
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/organizations");
    let path = "/api/organizations";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"q": {"style": "query", "apiName": "q"}, "showFeatured": {"style": "query", "apiName": "showFeatured"}, "page": {"style": "query", "apiName": "page"}, "page_size": {"style": "query", "apiName": "page_size"}};
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
    recordCall("katra_list_organizations", Date.now() - start, "ok");
  }
};
