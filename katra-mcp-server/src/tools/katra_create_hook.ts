/**
 * Tool: katra_create_hook
 * Create a new hook that reacts to one or more identity events, with its delivery configuration and enabled state. Supply the event name or list of events to subscribe to and the required config object for the hook target; returns the created hook record.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_create_hook",
  description: "Create a new hook that reacts to one or more identity events, with its delivery configuration and enabled state. Supply the event name or list of events to subscribe to and the required config object for the hook target; returns the created hook record.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant that owns the hook; omit to use the default tenant"),
    "name": z.string().optional().describe("Human-readable label for the hook, shown in listings"),
    "event": z.string().optional().describe("Single event name to subscribe to, e.g. \"PostRegister\""),
    "events": z.array(z.unknown()).optional().describe("Array of event names to subscribe to when the hook listens to more than one event"),
    "config": z.record(z.string(), z.unknown()).describe("Required hook payload: target type plus its settings (for example a webhook URL or an inline script)"),
    "enabled": z.boolean().optional().describe("Set true to activate the hook immediately after creation; defaults to false"),
    "createdAt": z.number().optional().describe("Creation timestamp in milliseconds; normally omitted and set by the server"),
    "verbose": z.boolean().optional().describe("Set true for the full hook payload instead of the condensed shape"),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/hooks");
    let path = "/api/hooks";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"tenantId": {"style": "body", "apiName": "tenantId"}, "name": {"style": "body", "apiName": "name"}, "event": {"style": "body", "apiName": "event"}, "events": {"style": "body", "apiName": "events"}, "config": {"style": "body", "apiName": "config"}, "enabled": {"style": "body", "apiName": "enabled"}, "createdAt": {"style": "body", "apiName": "createdAt"}};
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
    recordCall("katra_create_hook", Date.now() - start, "ok");
  }
};
