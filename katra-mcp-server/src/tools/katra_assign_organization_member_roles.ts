/**
 * Tool: katra_assign_organization_member_roles
 * Grant one or more organization roles to a single member of an organization. Roles are additive: existing role assignments for that user are kept, and duplicate assignments are ignored.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_assign_organization_member_roles",
  description: "Grant one or more organization roles to a single member of an organization. Roles are additive: existing role assignments for that user are kept, and duplicate assignments are ignored.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "id": z.string().describe("Id of the organization the member belongs to."),
    "userId": z.string().describe("Id of the member (user) receiving the roles."),
    "organizationRoleIds": z.array(z.unknown()).optional().describe("Array of organization role ids to grant; supply this or organizationRoleNames."),
    "organizationRoleNames": z.array(z.unknown()).optional().describe("Array of organization role names to grant; alternative to organizationRoleIds."),
    "verbose": z.boolean().optional().describe("Set true to return the role records in the response instead of minimal references; defaults to false."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/organizations/{id}/users/{userId}/roles");
    let path = "/api/organizations/{id}/users/{userId}/roles";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"id": {"style": "path", "apiName": "id"}, "userId": {"style": "path", "apiName": "userId"}, "organizationRoleIds": {"style": "body", "apiName": "organizationRoleIds"}, "organizationRoleNames": {"style": "body", "apiName": "organizationRoleNames"}};
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
    recordCall("katra_assign_organization_member_roles", Date.now() - start, "ok");
  }
};
