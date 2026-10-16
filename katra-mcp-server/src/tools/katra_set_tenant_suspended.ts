/**
 * Tool: katra_set_tenant_suspended
 * Suspend or re-activate the tenant identified by the given tenant id, immediately blocking or restoring sign-in for its users. Supply the desired state; the call is reversible by passing the opposite value.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_set_tenant_suspended",
  description: "Suspend or re-activate the tenant identified by the given tenant id, immediately blocking or restoring sign-in for its users. Supply the desired state; the call is reversible by passing the opposite value.",
  inputSchema: z.object({
    "isSuspended": z.string().optional().describe("Desired state, e.g. true to suspend the tenant or false to resume it."),
    "verbose": z.boolean().optional().describe("Set true to return the updated tenant record instead of a bare confirmation; defaults to false."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/tenants/{id}/suspend");
    let path = "/api/tenants/{id}/suspend";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"isSuspended": {"style": "body", "apiName": "isSuspended"}};
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
    recordCall("katra_set_tenant_suspended", Date.now() - start, "ok");
  }
};
