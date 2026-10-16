/**
 * Tool: katra_update_user
 * Modify a user's profile fields such as username, email, phone, display name, avatar, custom data or extended profile. Only the fields supplied are changed.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_update_user",
  description: "Modify a user's profile fields such as username, email, phone, display name, avatar, custom data or extended profile. Only the fields supplied are changed.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "userId": z.string().describe("ID of the user to update"),
    "username": z.string().optional().describe("New unique username"),
    "primaryEmail": z.string().optional().describe("New primary email address"),
    "primaryPhone": z.string().optional().describe("New primary phone number in E.164 format"),
    "name": z.string().optional().describe("New display name"),
    "avatar": z.string().optional().describe("New avatar image URL"),
    "customData": z.record(z.string(), z.unknown()).optional().describe("Replacement custom data JSON object"),
    "profile": z.record(z.string(), z.unknown()).optional().describe("Replacement extended profile JSON object"),
    "verbose": z.boolean().optional().describe("Set true to return the full updated user record instead of a minimal success response"),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/users/{userId}");
    let path = "/api/users/{userId}";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"userId": {"style": "path", "apiName": "userId"}, "username": {"style": "body", "apiName": "username"}, "primaryEmail": {"style": "body", "apiName": "primaryEmail"}, "primaryPhone": {"style": "body", "apiName": "primaryPhone"}, "name": {"style": "body", "apiName": "name"}, "avatar": {"style": "body", "apiName": "avatar"}, "customData": {"style": "body", "apiName": "customData"}, "profile": {"style": "body", "apiName": "profile"}};
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
    recordCall("katra_update_user", Date.now() - start, "ok");
  }
};
