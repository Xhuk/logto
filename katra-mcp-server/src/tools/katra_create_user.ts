/**
 * Tool: katra_create_user
 * Create a new user account in the tenant. Requires at least one identifier (email, phone or username) plus either a plaintext password or a pre-computed password digest; the user id is generated and returned.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_create_user",
  description: "Create a new user account in the tenant. Requires at least one identifier (email, phone or username) plus either a plaintext password or a pre-computed password digest; the user id is generated and returned.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "primaryPhone": z.string().optional().describe("Primary phone number in E.164 format, e.g. +15551234567"),
    "primaryEmail": z.string().optional().describe("Primary email address, e.g. user@example.com"),
    "username": z.string().optional().describe("Unique login username"),
    "password": z.string().optional().describe("Plaintext password; omit when supplying passwordDigest"),
    "passwordDigest": z.string().optional().describe("Pre-hashed password value; pair with passwordAlgorithm instead of sending a plaintext password"),
    "passwordAlgorithm": z.string().optional().describe("Hashing algorithm used for passwordDigest, e.g. SHA256, MD5, Argon2"),
    "name": z.string().optional().describe("Display name shown in the profile"),
    "avatar": z.string().optional().describe("URL of the user's avatar image"),
    "customData": z.record(z.string(), z.unknown()).optional().describe("Arbitrary JSON object stored as the user's custom data"),
    "profile": z.record(z.string(), z.unknown()).optional().describe("Additional profile fields as a JSON object"),
    "verbose": z.boolean().optional().describe("Set true to return the full created user record instead of a minimal success response"),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/users");
    let path = "/api/users";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"primaryPhone": {"style": "body", "apiName": "primaryPhone"}, "primaryEmail": {"style": "body", "apiName": "primaryEmail"}, "username": {"style": "body", "apiName": "username"}, "password": {"style": "body", "apiName": "password"}, "passwordDigest": {"style": "body", "apiName": "passwordDigest"}, "passwordAlgorithm": {"style": "body", "apiName": "passwordAlgorithm"}, "name": {"style": "body", "apiName": "name"}, "avatar": {"style": "body", "apiName": "avatar"}, "customData": {"style": "body", "apiName": "customData"}, "profile": {"style": "body", "apiName": "profile"}};
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
    recordCall("katra_create_user", Date.now() - start, "ok");
  }
};
