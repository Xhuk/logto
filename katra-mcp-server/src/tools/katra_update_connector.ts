/**
 * Tool: katra_update_connector
 * Update an existing connector's config, metadata, or behavior flags; only the fields supplied are changed. Use this to rotate provider credentials or toggle profile sync and token storage.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_update_connector",
  description: "Update an existing connector's config, metadata, or behavior flags; only the fields supplied are changed. Use this to rotate provider credentials or toggle profile sync and token storage.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "id": z.string().describe("Id of the connector to update."),
    "config": z.record(z.string(), z.unknown()).optional().describe("Replacement factory config object; supplied keys overwrite the stored values."),
    "metadata": z.record(z.string(), z.unknown()).optional().describe("Display metadata to change, e.g. {\"name\":\"Corporate SSO\",\"logo\":\"https://...\"}."),
    "syncProfile": z.boolean().optional().describe("Set true to sync user profiles from the provider on each social sign-in, false to stop syncing."),
    "enableTokenStorage": z.boolean().optional().describe("Set true to store provider tokens for later use by apps, false to disable token storage."),
    "verbose": z.boolean().optional().describe("Set true to return the full updated connector payload; defaults to false."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/connectors/{id}");
    let path = "/api/connectors/{id}";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"id": {"style": "path", "apiName": "id"}, "config": {"style": "body", "apiName": "config"}, "metadata": {"style": "body", "apiName": "metadata"}, "syncProfile": {"style": "body", "apiName": "syncProfile"}, "enableTokenStorage": {"style": "body", "apiName": "enableTokenStorage"}};
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
    recordCall("katra_update_connector", Date.now() - start, "ok");
  }
};
