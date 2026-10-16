/**
 * Tool: katra_update_organization_role
 * Update an existing organization role's name, description or type; only the fields supplied are changed and everything else is left as is. Returns the updated role.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_update_organization_role",
  description: "Update an existing organization role's name, description or type; only the fields supplied are changed and everything else is left as is. Returns the updated role.",
  inputSchema: z.object({
    "id": z.string().describe("Id of the organization role to update"),
    "tenantId": z.string().optional().describe("Id of the tenant that owns the role; omit to use the default tenant"),
    "name": z.string().optional().describe("New unique name for the role"),
    "description": z.string().optional().describe("New description for the role"),
    "type": z.string().optional().describe("New role type, e.g. \"User\" or \"MachineToMachine\""),
    "verbose": z.boolean().optional().describe("Set true to return the full role record instead of the summary"),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/organization-roles/{id}");
    let path = "/api/organization-roles/{id}";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"id": {"style": "path", "apiName": "id"}, "tenantId": {"style": "body", "apiName": "tenantId"}, "name": {"style": "body", "apiName": "name"}, "description": {"style": "body", "apiName": "description"}, "type": {"style": "body", "apiName": "type"}};
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
    recordCall("katra_update_organization_role", Date.now() - start, "ok");
  }
};
