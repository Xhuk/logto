/**
 * Tool: katra_upsert_jwt_customizer
 * Create or replace the JWT customizer for a given token type, including its script and environment variables. The supplied values overwrite the existing customizer for that token type.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_upsert_jwt_customizer",
  description: "Create or replace the JWT customizer for a given token type, including its script and environment variables. The supplied values overwrite the existing customizer for that token type.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "tokenTypePath": z.string().describe("Token type to customize, such as access-token or client-credentials."),
    "script": z.string().optional().describe("Customization script source code run when issuing the token."),
    "environmentVariables": z.string().optional().describe("Environment variables available to the script, as a JSON string mapping names to values."),
    "contextSample": z.string().optional().describe("Sample context JSON used for testing the script."),
    "tokenSample": z.string().optional().describe("Sample token payload JSON used for testing the script."),
    "blockIssuanceOnError": z.string().optional().describe("Whether to reject token issuance when the script fails; pass as a string, e.g. \"true\" or \"false\"."),
    "verbose": z.boolean().optional().describe("Set true to return the full customizer after saving; omit for the default."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/configs/jwt-customizer/{tokenTypePath}");
    let path = "/api/configs/jwt-customizer/{tokenTypePath}";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"tokenTypePath": {"style": "path", "apiName": "tokenTypePath"}, "script": {"style": "body", "apiName": "script"}, "environmentVariables": {"style": "body", "apiName": "environmentVariables"}, "contextSample": {"style": "body", "apiName": "contextSample"}, "tokenSample": {"style": "body", "apiName": "tokenSample"}, "blockIssuanceOnError": {"style": "body", "apiName": "blockIssuanceOnError"}};
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
      method: "PUT",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(bodyFields) : undefined,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const result = await resp.json();
    const payload = params.verbose ? { data: result, _meta: { status: resp.status } } : compact(result);
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], structuredContent: payload };
  } finally {
    recordCall("katra_upsert_jwt_customizer", Date.now() - start, "ok");
  }
};
