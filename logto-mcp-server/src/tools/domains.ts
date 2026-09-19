import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { render } from '../format.js';
import type { LogtoClient } from '../logto-client.js';

const responseFormatSchema = z
  .enum(['json', 'markdown'])
  .default('markdown')
  .describe('Output format. Use "json" for programmatic processing, "markdown" for readability.');

const tenantIdSchema = z.string().min(1).describe('The tenant (project) ID that owns the domain.');
const domainIdSchema = z.string().min(1).describe('The domain ID (not the hostname).');

export type DomainDnsRecord = {
  type: string;
  name: string;
  value: string;
};

export type Domain = {
  id: string;
  domain: string;
  status: string;
  errorMessage?: string | null;
  dnsRecords?: DomainDnsRecord[];
};

const text = (value: string) => ({ type: 'text' as const, text: value });
const ok = (value: string) => ({ content: [text(value)] });

const fail = (error: unknown, tenantId?: string) => ({
  isError: true,
  content: [
    text(
      `Error: ${error instanceof Error ? error.message : String(error)}. ` +
        (tenantId
          ? `Verify the tenant ID ("${tenantId}"), that the domain's DNS record points to this deployment, and that the machine-to-machine app is granted the Management API scope on that tenant.`
          : 'Verify the domain ID and the machine-to-machine app scope.')
    ),
  ],
});

export const domainToMarkdown = (domain: Domain): string =>
  [
    `### ${domain.domain} (\`${domain.id}\`)`,
    `- Status: \`${domain.status}\``,
    ...(domain.errorMessage ? [`- Error: ${domain.errorMessage}`] : []),
    ...(domain.dnsRecords && domain.dnsRecords.length > 0
      ? [
          '- DNS records:',
          ...domain.dnsRecords.map(
            (record) => `  - \`${record.type}\` ${record.name} -> ${record.value}`
          ),
        ]
      : []),
  ].join('\n');

const domainsToMarkdown = (domains: Domain[]): string =>
  domains.length === 0
    ? '_No custom domains configured for this tenant._'
    : domains.map((domain) => domainToMarkdown(domain)).join('\n\n');

const verifyNote =
  'Verification checks the DNS record and provisions the certificate; it can take a while to become Active.';

/**
 * Register the per-tenant custom domain tools.
 *
 * Domains are per tenant, so each tool targets the tenant's own Management API. This is the step
 * that gives every tenant its isolated URL (for example `proyecto1.your-domain`).
 */
export const registerDomainTools = (server: McpServer, client: LogtoClient): void => {
  server.registerTool(
    'logto_list_domains',
    {
      title: 'List custom domains of a tenant',
      description: 'List every custom domain configured for a tenant, with its verification status.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, response_format }) => {
      try {
        const domains = await client.requestForTenant<Domain[]>(tenant_id, 'api/domains');

        return ok(render(domains, response_format, domainsToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_add_domain',
    {
      title: 'Add a custom domain to a tenant',
      description:
        'Register a custom domain for a tenant. The domain must already point to this deployment via DNS (CNAME). ' +
        'Add it here first, then verify it.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        domain: z
          .string()
          .min(1)
          .describe('The hostname to register, e.g. "auth.proyecto1.com" (no scheme, no path).'),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ tenant_id, domain, response_format }) => {
      try {
        const created = await client.requestForTenant<Domain>(tenant_id, 'api/domains', {
          method: 'POST',
          body: { domain },
        });

        return ok(render(created, response_format, domainToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_verify_domain',
    {
      title: 'Verify a custom domain',
      description: `Trigger verification for a custom domain that was already added. ${verifyNote}`,
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        domain_id: domainIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, domain_id, response_format }) => {
      try {
        const domain = await client.requestForTenant<Domain>(
          tenant_id,
          `api/domains/${domain_id}/verify`,
          { method: 'POST' }
        );

        return ok(render(domain, response_format, domainToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_delete_domain',
    {
      title: 'Delete a custom domain',
      description: 'Remove a custom domain from a tenant. Clients using that URL will stop working.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        domain_id: domainIdSchema,
        confirm: z.literal(true).describe('Must be true. A safety guard against accidental deletion.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ tenant_id, domain_id }) => {
      try {
        await client.requestForTenant(tenant_id, `api/domains/${domain_id}`, { method: 'DELETE' });

        return ok(`Deleted domain \`${domain_id}\` from tenant \`${tenant_id}\`.`);
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );
};
