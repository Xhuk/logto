/**
 * Tool: katra_create_organization_invitation
 * Invite a person to join an organization by sending them an invitation email; the invitation optionally grants organization roles on acceptance. Returns the created invitation record, including its id and invite link.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_create_organization_invitation",
  description: "Invite a person to join an organization by sending them an invitation email; the invitation optionally grants organization roles on acceptance. Returns the created invitation record, including its id and invite link.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "inviterId": z.string().optional().describe("User id of the person sending the invitation; omit to use the currently authenticated user"),
    "invitee": z.string().describe("Email address of the person being invited"),
    "organizationId": z.string().describe("Id of the organization the invitee is being invited to join"),
    "expiresAt": z.number().describe("Expiry of the invitation as a Unix timestamp in seconds (e.g. 1735689600)"),
    "organizationRoleIds": z.array(z.unknown()).optional().describe("Array of organization role ids to assign to the invitee once they accept; omit or pass an empty array for no roles"),
    "messagePayload": z.record(z.string(), z.unknown()).describe("Object holding the email content for the invitation, typically {\"link\":\"<invite link>\",\"invitee\":\"<email>\"}; required even when the default template is used"),
    "verbose": z.boolean().optional().describe("Set true to return the full invitation record instead of the summary"),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/organization-invitations");
    let path = "/api/organization-invitations";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"inviterId": {"style": "body", "apiName": "inviterId"}, "invitee": {"style": "body", "apiName": "invitee"}, "organizationId": {"style": "body", "apiName": "organizationId"}, "expiresAt": {"style": "body", "apiName": "expiresAt"}, "organizationRoleIds": {"style": "body", "apiName": "organizationRoleIds"}, "messagePayload": {"style": "body", "apiName": "messagePayload"}};
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
    recordCall("katra_create_organization_invitation", Date.now() - start, "ok");
  }
};
