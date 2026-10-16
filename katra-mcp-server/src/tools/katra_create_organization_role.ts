/**
 * Tool: katra_create_organization_role
 * Create an organization role that packages organization scopes and API resource scopes, so it can be assigned to organization members. Returns the new role with its id.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_create_organization_role",
  description: "Create an organization role that packages organization scopes and API resource scopes, so it can be assigned to organization members. Returns the new role with its id.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Id of the tenant to create the role in; omit to use the default tenant"),
    "name": z.string().describe("Unique name for the role, for example \"admin\""),
    "description": z.string().optional().describe("Human-readable description of what the role is for; shown in the admin console"),
    "type": z.string().optional().describe("Kind of role, e.g. \"User\" for members or \"MachineToMachine\" for M2M applications"),
    "organizationScopeIds": z.array(z.unknown()).describe("Array of organization scope ids the role grants, e.g. [\"scope_id\"]; pass an empty array for none"),
    "resourceScopeIds": z.array(z.unknown()).describe("Array of API resource scope ids the role grants; pass an empty array for none"),
    "verbose": z.boolean().optional().describe("Set true to return the full role record instead of the summary"),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/organization-roles");
    let path = "/api/organization-roles";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"tenantId": {"style": "body", "apiName": "tenantId"}, "name": {"style": "body", "apiName": "name"}, "description": {"style": "body", "apiName": "description"}, "type": {"style": "body", "apiName": "type"}, "organizationScopeIds": {"style": "body", "apiName": "organizationScopeIds"}, "resourceScopeIds": {"style": "body", "apiName": "resourceScopeIds"}};
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
    recordCall("katra_create_organization_role", Date.now() - start, "ok");
  }
};
