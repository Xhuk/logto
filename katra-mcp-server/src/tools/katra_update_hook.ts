/**
 * Tool: katra_update_hook
 * Update an existing hook's name, subscribed events, configuration or enabled state; only the fields supplied are changed. Returns the updated hook record.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_update_hook",
  description: "Update an existing hook's name, subscribed events, configuration or enabled state; only the fields supplied are changed. Returns the updated hook record.",
  inputSchema: z.object({
    "id": z.string().describe("Id of the hook to update"),
    "tenantId": z.string().optional().describe("Move the hook to a different tenant; omit to leave it as is"),
    "name": z.string().optional().describe("New label for the hook"),
    "event": z.string().optional().describe("Replace the subscription with this single event name"),
    "events": z.array(z.unknown()).optional().describe("Replace the subscription with this array of event names"),
    "config": z.record(z.string(), z.unknown()).optional().describe("Replace the hook configuration, including target type and settings"),
    "enabled": z.boolean().optional().describe("Set true to activate the hook or false to pause it"),
    "createdAt": z.number().optional().describe("Creation timestamp in milliseconds; normally left untouched"),
    "verbose": z.boolean().optional().describe("Set true for the full hook payload instead of the condensed shape"),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/hooks/{id}");
    let path = "/api/hooks/{id}";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"id": {"style": "path", "apiName": "id"}, "tenantId": {"style": "body", "apiName": "tenantId"}, "name": {"style": "body", "apiName": "name"}, "event": {"style": "body", "apiName": "event"}, "events": {"style": "body", "apiName": "events"}, "config": {"style": "body", "apiName": "config"}, "enabled": {"style": "body", "apiName": "enabled"}, "createdAt": {"style": "body", "apiName": "createdAt"}};
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
    recordCall("katra_update_hook", Date.now() - start, "ok");
  }
};
