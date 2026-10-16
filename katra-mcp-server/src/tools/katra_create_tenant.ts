/**
 * Tool: katra_create_tenant
 * Create a new tenant in the deployment and return its record, including the generated tenant id used by every other tenant-scoped tool. Name it distinctly so it can be recognized in tenant lists and logs later.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_create_tenant",
  description: "Create a new tenant in the deployment and return its record, including the generated tenant id used by every other tenant-scoped tool. Name it distinctly so it can be recognized in tenant lists and logs later.",
  inputSchema: z.object({
    "name": z.string().optional().describe("Display name for the tenant, e.g. 'Acme Production'."),
    "tag": z.string().optional().describe("Short free-form label for grouping or filtering tenants."),
    "groupName": z.string().optional().describe("Group the tenant belongs to, used to cluster related tenants."),
    "verbose": z.boolean().optional().describe("Set true to return the full tenant record instead of the trimmed summary; defaults to false."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/tenants");
    let path = "/api/tenants";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"name": {"style": "body", "apiName": "name"}, "tag": {"style": "body", "apiName": "tag"}, "groupName": {"style": "body", "apiName": "groupName"}};
    for (const [k, v] of Object.entries(params)) {
      if (v == null || k === "verbose") continue;
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
    recordCall("katra_create_tenant", Date.now() - start, "ok");
  }
};
