/**
 * Tool: katra_create_role
 * Create a new role that can be granted to users or applications and linked to scopes. The role name must be unique within the tenant; returns the created role including its generated id.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_create_role",
  description: "Create a new role that can be granted to users or applications and linked to scopes. The role name must be unique within the tenant; returns the created role including its generated id.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant to create the role in; omit to use the default tenant."),
    "name": z.string().describe("Unique role name, e.g. 'admin' or 'editor'."),
    "description": z.string().describe("Human-readable explanation of what the role grants."),
    "type": z.string().optional().describe("Role category, typically 'User' or 'MachineToMachine'."),
    "isDefault": z.boolean().optional().describe("Set true to grant this role automatically to every newly created user."),
    "scopeIds": z.array(z.unknown()).optional().describe("Array of scope ids to link to the role at creation time."),
    "verbose": z.boolean().optional().describe("Set true to return the full role object in the response."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/roles");
    let path = "/api/roles";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"tenantId": {"style": "body", "apiName": "tenantId"}, "name": {"style": "body", "apiName": "name"}, "description": {"style": "body", "apiName": "description"}, "type": {"style": "body", "apiName": "type"}, "isDefault": {"style": "body", "apiName": "isDefault"}, "scopeIds": {"style": "body", "apiName": "scopeIds"}};
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
    recordCall("katra_create_role", Date.now() - start, "ok");
  }
};
