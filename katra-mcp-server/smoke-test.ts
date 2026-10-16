/**
 * Smoke test against a live Katra deployment: exercises the shared transport (base-URL
 * resolution per tenant, client-credentials token cache, bearer injection) through the
 * generated tool handlers themselves.
 *
 * Read-only: it never mutates the deployment.
 *
 *   KATRA_LOGTO_HOST=... KATRA_LOGTO_ADMIN_BASE_URL=... \
 *   KATRA_LOGTO_CLIENT_ID=... KATRA_LOGTO_CLIENT_SECRET=... \
 *   npx tsx smoke-test.ts [tenantId]
 */
import { handler as listTenants } from "./src/tools/katra_list_tenants.js";
import { handler as listApplications } from "./src/tools/katra_list_applications.js";
import { handler as listDomains } from "./src/tools/katra_list_domains.js";
import { handler as getSignInExperience } from "./src/tools/katra_get_sign_in_experience.js";
import { handler as listConnectors } from "./src/tools/katra_list_connectors.js";

const tenantId = process.argv[2] ?? process.env["KATRA_LOGTO_TENANT_ID"] ?? "";

const text = (result: unknown): string => {
  const payload = (result as { structuredContent?: unknown }).structuredContent ?? result;
  const data = (payload as { data?: unknown }).data ?? payload;
  if (Array.isArray(data)) {
    return `${data.length} rows: ${data
      .slice(0, 3)
      .map((row) => JSON.stringify(row).slice(0, 90))
      .join(" | ")}`;
  }
  return JSON.stringify(data).slice(0, 160);
};

const run = async (label: string, call: () => Promise<unknown>) => {
  try {
    const started = Date.now();
    const result = await call();
    console.log(`OK   ${label} (${Date.now() - started} ms): ${text(result)}`);
  } catch (error) {
    console.log(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
};

await run("katra_list_tenants [control plane]", () => listTenants({}));
await run("katra_list_applications [tenant]", () => listApplications({ tenantId }));
await run("katra_list_domains [tenant]", () => listDomains({ tenantId }));
await run("katra_get_sign_in_experience [tenant]", () => getSignInExperience({ tenantId }));
await run("katra_list_connectors [tenant]", () => listConnectors({ tenantId }));
