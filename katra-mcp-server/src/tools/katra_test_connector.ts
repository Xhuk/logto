/**
 * Tool: katra_test_connector
 * Send a live test message through a passwordless connector factory using the supplied config, without saving the connector. Provide either a phone number or an email address as the destination and check that delivery succeeds.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_test_connector",
  description: "Send a live test message through a passwordless connector factory using the supplied config, without saving the connector. Provide either a phone number or an email address as the destination and check that delivery succeeds.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "factoryId": z.string().describe("Factory identifier to test, e.g. \"smtp\", \"twilio-sms\", \"aliyun-sms\"."),
    "phone": z.string().optional().describe("Destination phone number in E.164 format for SMS factories, e.g. \"+15551234567\"."),
    "email": z.string().optional().describe("Destination email address for email factories."),
    "config": z.record(z.string(), z.unknown()).describe("Factory-specific test configuration; must include the credentials and sender settings the factory requires."),
    "locale": z.string().optional().describe("Locale for the message template, e.g. \"en\", \"zh-CN\"."),
    "verbose": z.boolean().optional().describe("Set true to return the full test response payload; defaults to false."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/connectors/{factoryId}/test");
    let path = "/api/connectors/{factoryId}/test";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"factoryId": {"style": "path", "apiName": "factoryId"}, "phone": {"style": "body", "apiName": "phone"}, "email": {"style": "body", "apiName": "email"}, "config": {"style": "body", "apiName": "config"}, "locale": {"style": "body", "apiName": "locale"}};
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
    recordCall("katra_test_connector", Date.now() - start, "ok");
  }
};
