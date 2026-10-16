/**
 * Tool: katra_list_audit_logs
 * List audit log entries, optionally narrowed by user, application, log key or time range. Results are paginated, and each entry records what happened, when, and who or what triggered it.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_list_audit_logs",
  description: "List audit log entries, optionally narrowed by user, application, log key or time range. Results are paginated, and each entry records what happened, when, and who or what triggered it.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "userId": z.string().optional().describe("Filter to events performed by or about this user id."),
    "applicationId": z.string().optional().describe("Filter to events tied to this application id."),
    "logKey": z.string().optional().describe("Filter to a single event type, e.g. a specific Logto log key such as 'RegisterUsernamePassword'."),
    "enableCap": z.string().optional().describe("Set to 'true' to cap the number of returned entries, limiting how much history is fetched per call."),
    "start_time": z.string().optional().describe("Earliest event time to include, as an ISO 8601 timestamp."),
    "end_time": z.string().optional().describe("Latest event time to include, as an ISO 8601 timestamp."),
    "page": z.number().int().optional().describe("Page number to fetch, starting at 1; defaults to the first page."),
    "page_size": z.number().int().optional().describe("Number of log entries per page; defaults to the server's standard page size."),
    "verbose": z.boolean().optional().describe("Set true to include extra detail in the response; defaults to false."),
  }),
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/logs");
    let path = "/api/logs";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"userId": {"style": "query", "apiName": "userId"}, "applicationId": {"style": "query", "apiName": "applicationId"}, "logKey": {"style": "query", "apiName": "logKey"}, "enableCap": {"style": "query", "apiName": "enableCap"}, "start_time": {"style": "query", "apiName": "start_time"}, "end_time": {"style": "query", "apiName": "end_time"}, "page": {"style": "query", "apiName": "page"}, "page_size": {"style": "query", "apiName": "page_size"}};
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
      method: "GET",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(bodyFields) : undefined,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const result = await resp.json();
    const payload = params.verbose ? { data: result, _meta: { status: resp.status } } : compact(result);
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], structuredContent: payload };
  } finally {
    recordCall("katra_list_audit_logs", Date.now() - start, "ok");
  }
};
