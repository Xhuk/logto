/**
 * Tool: katra_update_email_template_details
 * Modify the subject, body, content type or sender fields of one email template identified by its id. Only the fields supplied are changed.
 */
import { z } from "zod";
import { compact } from "../compact.js";
import { recordCall } from "../telemetry.js";
import { apiFetch, baseUrlFor } from "../client.js";

export const config = {
  name: "katra_update_email_template_details",
  description: "Modify the subject, body, content type or sender fields of one email template identified by its id. Only the fields supplied are changed.",
  inputSchema: z.object({
    "tenantId": z.string().optional().describe("Tenant id this call targets (path-based multi-tenancy); defaults to the server's KATRA_LOGTO_TENANT_ID."),
    "id": z.string().describe("Identifier of the email template to update, as returned by the email template listing."),
    "subject": z.string().optional().describe("New email subject line; supports template variables such as {{code}} or {{application.name}}."),
    "content": z.string().optional().describe("New email body, either HTML or plain text depending on contentType."),
    "contentType": z.record(z.string(), z.unknown()).optional().describe("Body format, e.g. {\"type\":\"text/html\",\"charset\":\"utf-8\"} or {\"type\":\"text/plain\"}."),
    "replyTo": z.string().optional().describe("Reply-to email address for the message."),
    "sendFrom": z.string().optional().describe("Sender address shown as the From header, e.g. \"Acme <no-reply@acme.com>\"."),
    "verbose": z.boolean().optional().describe("Set true to return the updated template with the response (default false)."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};

export const handler = async (params: any): Promise<any> => {
  const start = Date.now();
  try {
    const baseUrl = await baseUrlFor(params, "/api/email-templates/{id}/details");
    let path = "/api/email-templates/{id}/details";
    const bodyFields: Record<string, unknown> = {};
    const queryParams: Record<string, string> = {};
    const paramMeta: Record<string, { style: string; apiName: string }> = {"id": {"style": "path", "apiName": "id"}, "subject": {"style": "body", "apiName": "subject"}, "content": {"style": "body", "apiName": "content"}, "contentType": {"style": "body", "apiName": "contentType"}, "replyTo": {"style": "body", "apiName": "replyTo"}, "sendFrom": {"style": "body", "apiName": "sendFrom"}};
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
    recordCall("katra_update_email_template_details", Date.now() - start, "ok");
  }
};
