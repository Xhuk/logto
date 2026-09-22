import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { render, tenantsToMarkdown, tenantToMarkdown, type Tenant } from '../format.js';
import type { LogtoClient } from '../logto-client.js';

const responseFormatSchema = z
  .enum(['json', 'markdown'])
  .default('markdown')
  .describe('Output format. Use "json" for programmatic processing, "markdown" for readability.');

const tenantIdSchema = z.string().min(1).describe('The tenant ID, e.g. "proyecto1".');
const tenantTagSchema = z
  .enum(['development', 'production'])
  .describe('Tenant tag. "production" tenants are meant for production environments.');

const text = (value: string) => ({ type: 'text' as const, text: value });

/** Wrap a value in a successful tool result. */
const ok = (value: string) => ({ content: [text(value)] });

/** Wrap an error in a failed tool result with an actionable message. */
const fail = (error: unknown) => ({
  isError: true,
  content: [
    text(
      `Error: ${error instanceof Error ? error.message : String(error)}. ` +
        'Verify the tenant ID and that the machine-to-machine app has the Management API `all` scope.'
    ),
  ],
});

/**
 * Register the tenant management tools (the multi-tenant control plane) on the MCP server.
 */
export const registerTenantTools = (server: McpServer, client: LogtoClient): void => {
  server.registerTool(
    'logto_list_tenants',
    {
      title: 'List Logto tenants',
      description:
        'List every tenant (project) in this Logto deployment, including its feature flags and suspension state.',
      inputSchema: z.object({ response_format: responseFormatSchema }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ response_format }) => {
      try {
        const tenants = await client.visibleTenants(
          await client.request<Tenant[]>('api/tenants', {}, { skipAuthorize: true })
        );

        return ok(render(tenants, response_format, tenantsToMarkdown));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    'logto_get_tenant',
    {
      title: 'Get a Logto tenant',
      description: 'Get a single tenant by ID, including its feature flags and suspension state.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, response_format }) => {
      try {
        const tenant = await client.request<Tenant>(`api/tenants/${tenant_id}`);

        return ok(render(tenant, response_format, tenantToMarkdown));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    'logto_create_tenant',
    {
      title: 'Create a Logto tenant',
      description:
        'Create a new isolated tenant (project) with its own users, applications, connectors and sign-in experience.',
      inputSchema: z.object({
        name: tenantIdSchema.max(128).describe('Display name for the new tenant.'),
        tag: tenantTagSchema.optional(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ name, tag, response_format }) => {
      try {
        const tenant = await client.request<Tenant>('api/tenants', {
          method: 'POST',
          body: { name, tag },
        });

        return ok(render(tenant, response_format, tenantToMarkdown));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    'logto_update_tenant',
    {
      title: 'Update a Logto tenant',
      description: 'Update a tenant name and/or tag.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        name: z.string().min(1).max(128).optional().describe('New display name.'),
        tag: tenantTagSchema.optional(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, name, tag, response_format }) => {
      try {
        const tenant = await client.request<Tenant>(`api/tenants/${tenant_id}`, {
          method: 'PATCH',
          body: { name, tag },
        });

        return ok(render(tenant, response_format, tenantToMarkdown));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    'logto_set_tenant_features',
    {
      title: 'Set tenant feature flags',
      description:
        'Enable or disable features for a tenant. Missing flags are treated as enabled. Example: { "organizations": false } disables the Organizations feature for that tenant only.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        features: z
          .record(z.string(), z.boolean())
          .describe('Map of feature key to enabled flag, e.g. { "mfa": false }.'),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, features, response_format }) => {
      try {
        const tenant = await client.request<Tenant>(`api/tenants/${tenant_id}/features`, {
          method: 'PATCH',
          body: { features },
        });

        return ok(render(tenant, response_format, tenantToMarkdown));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    'logto_suspend_tenant',
    {
      title: 'Suspend or resume a Logto tenant',
      description:
        'Suspend or resume a tenant. Suspended tenants reject sign-in and management requests.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        is_suspended: z.boolean().describe('true to suspend the tenant, false to resume it.'),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, is_suspended, response_format }) => {
      try {
        const tenant = await client.request<Tenant>(`api/tenants/${tenant_id}/suspend`, {
          method: 'POST',
          body: { isSuspended: is_suspended },
        });

        return ok(render(tenant, response_format, tenantToMarkdown));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    'logto_delete_tenant',
    {
      title: 'Delete a Logto tenant',
      description:
        'Permanently delete a tenant, its database role and all of its data. This cannot be undone. The admin tenant cannot be deleted.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        confirm: z.literal(true).describe('Must be true. A safety guard against accidental deletion.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id }) => {
      try {
        await client.request(`api/tenants/${tenant_id}`, { method: 'DELETE' });

        return ok(`Deleted tenant \`${tenant_id}\`.`);
      } catch (error) {
        return fail(error);
      }
    }
  );
};
