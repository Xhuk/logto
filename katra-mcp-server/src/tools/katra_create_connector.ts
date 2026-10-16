/**
 * Tool: katra_create_connector
 * Create a new connector instance from a connector factory so users can sign in, receive codes, or send messages through it. The connector is configured immediately with the supplied factory config and appears in the connector list right away.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_create_connector",
  description: "Create a new connector instance from a connector factory so users can sign in, receive codes, or send messages through it. The connector is configured immediately with the supplied factory config and appears in the connector list right away.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "config": z.record(z.string(), z.unknown()).optional().describe("Object of factory-specific settings, e.g. {\"clientId\":\"...\",\"clientSecret\":\"...\"} for social connectors or SMTP host/port/auth for email."),
    "connectorId": z.string().describe("Factory identifier to instantiate, e.g. \"google\", \"github\", \"saml\", \"smtp\", \"twilio-sms\". Required."),
    "metadata": z.record(z.string(), z.unknown()).optional().describe("Display metadata, e.g. {\"name\":\"Google\",\"logo\":\"https://...\",\"logoDark\":\"https://...\"}."),
    "syncProfile": z.boolean().optional().describe("Set true to sync the user's profile (name, avatar) from the provider on each social sign-in; defaults to false."),
    "enableTokenStorage": z.boolean().optional().describe("Set true to persist the provider access/refresh tokens so downstream apps can call the provider on the user's behalf; defaults to false."),
    "id": z.string().optional().describe("Custom connector id to assign instead of an auto-generated one."),
    "verbose": z.boolean().optional().describe("Set true to return the full connector payload in the response; defaults to false."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/connectors");
    let path = "/api/connectors";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"config": {"style": "body", "apiName": "config"}, "connectorId": {"style": "body", "apiName": "connectorId"}, "metadata": {"style": "body", "apiName": "metadata"}, "syncProfile": {"style": "body", "apiName": "syncProfile"}, "enableTokenStorage": {"style": "body", "apiName": "enableTokenStorage"}, "id": {"style": "body", "apiName": "id"}};
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
    recordCall("katra_create_connector", Date.now() - start, "ok");
  }
};
