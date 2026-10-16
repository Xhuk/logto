/**
 * Tool: katra_create_resource
 * Register a new API resource (an audience-protected API) in the tenant, identified by a unique indicator URI. Returns the created resource record including its id.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_create_resource",
  description: "Register a new API resource (an audience-protected API) in the tenant, identified by a unique indicator URI. Returns the created resource record including its id.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant to create the resource in; omit to use the default tenant."),
    "name": z.string().describe("Human-readable display name for the resource."),
    "indicator": z.string().describe("Unique identifier of the API, typically its resource URI (e.g. https://api.example.com)."),
    "accessTokenTtl": z.number().optional().describe("Access token lifetime in seconds issued for this resource; defaults to the tenant-wide value when omitted."),
    "verbose": z.boolean().optional().describe("Set true to include the full resource object with scopes in the response."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/resources");
    let path = "/api/resources";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"tenantId": {"style": "body", "apiName": "tenantId"}, "name": {"style": "body", "apiName": "name"}, "indicator": {"style": "body", "apiName": "indicator"}, "accessTokenTtl": {"style": "body", "apiName": "accessTokenTtl"}};
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
    recordCall("katra_create_resource", Date.now() - start, "ok");
  }
};
