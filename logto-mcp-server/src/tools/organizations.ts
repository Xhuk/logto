import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { render } from '../format.js';
import type { LogtoClient } from '../logto-client.js';

import {
  confirmSchema,
  fail,
  ok,
  omitUndefined,
  pageSchema,
  pageSizeSchema,
  responseFormatSchema,
  tenantIdSchema,
  withQuery,
} from './shared.js';

type Organization = {
  id: string;
  name: string;
  description?: string | null;
};

type OrganizationRole = {
  id: string;
  name: string;
  description?: string | null;
};

const organizationIdSchema = z.string().min(1).describe('The organization ID.');

const organizationToMarkdown = (organization: Organization): string =>
  [
    `### ${organization.name} (\`${organization.id}\`)`,
    `- Description: ${organization.description ?? '—'}`,
  ].join('\n');

const organizationsToMarkdown = (organizations: Organization[]): string =>
  organizations.length === 0
    ? '_No organizations on this page._'
    : organizations.map((organization) => organizationToMarkdown(organization)).join('\n\n');

const roleToMarkdown = (role: OrganizationRole): string =>
  [`### ${role.name} (\`${role.id}\`)`, `- Description: ${role.description ?? '—'}`].join('\n');

/**
 * Register organization tools. Organization roles are the template shared by every organization
 * in the tenant. Membership is per organization.
 */
export const registerOrganizationTools = (server: McpServer, client: LogtoClient): void => {
  server.registerTool(
    'logto_list_organizations',
    {
      title: 'List organizations',
      description: 'List organizations in a tenant. The Admin Console organization list shows the same records.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        search: z.string().min(1).optional().describe('Partial organization ID or name.'),
        page: pageSchema,
        page_size: pageSizeSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, search, page, page_size, response_format }) => {
      try {
        const organizations = await client.requestForTenant<Organization[]>(
          tenant_id,
          withQuery('api/organizations', { q: search, page, page_size })
        );

        return ok(render(organizations, response_format, organizationsToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_get_organization',
    {
      title: 'Get an organization',
      description: 'Get one organization by ID.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        organization_id: organizationIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, organization_id, response_format }) => {
      try {
        const organization = await client.requestForTenant<Organization>(
          tenant_id,
          `api/organizations/${organization_id}`
        );

        return ok(render(organization, response_format, organizationToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_create_organization',
    {
      title: 'Create an organization',
      description: 'Create an organization. A person can open it in the Admin Console to verify members and roles.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        name: z.string().min(1).max(128),
        description: z.string().max(256).optional(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ tenant_id, name, description, response_format }) => {
      try {
        const organization = await client.requestForTenant<Organization>(tenant_id, 'api/organizations', {
          method: 'POST',
          body: omitUndefined({ name, description }),
        });

        return ok(render(organization, response_format, organizationToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_update_organization',
    {
      title: 'Update an organization',
      description: 'Update an organization name and/or description.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        organization_id: organizationIdSchema,
        name: z.string().min(1).max(128).optional(),
        description: z.string().max(256).nullable().optional(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, organization_id, name, description, response_format }) => {
      try {
        const organization = await client.requestForTenant<Organization>(
          tenant_id,
          `api/organizations/${organization_id}`,
          { method: 'PATCH', body: omitUndefined({ name, description }) }
        );

        return ok(render(organization, response_format, organizationToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_delete_organization',
    {
      title: 'Delete an organization',
      description: 'Permanently delete an organization and its memberships. This cannot be undone.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        organization_id: organizationIdSchema,
        confirm: confirmSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, organization_id }) => {
      try {
        await client.requestForTenant(tenant_id, `api/organizations/${organization_id}`, {
          method: 'DELETE',
        });

        return ok(`Deleted organization \`${organization_id}\` from tenant \`${tenant_id}\`.`);
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_add_organization_members',
    {
      title: 'Add users to an organization',
      description: 'Add existing users to an organization. Users must already exist in the tenant.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        organization_id: organizationIdSchema,
        user_ids: z.array(z.string().min(1)).min(1),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ tenant_id, organization_id, user_ids, response_format }) => {
      try {
        const result = await client.requestForTenant<{ userIds: string[] }>(
          tenant_id,
          `api/organizations/${organization_id}/users`,
          { method: 'POST', body: { userIds: user_ids } }
        );

        return ok(render(result, response_format, (value) => `Added: ${value.userIds.map((id) => `\`${id}\``).join(', ')}`));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_list_organization_roles',
    {
      title: 'List organization roles',
      description:
        'List the organization role template for the tenant. These roles are shared by every organization.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        page: pageSchema,
        page_size: pageSizeSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, page, page_size, response_format }) => {
      try {
        const roles = await client.requestForTenant<OrganizationRole[]>(
          tenant_id,
          withQuery('api/organization-roles', { page, page_size })
        );

        return ok(
          render(roles, response_format, (value) =>
            value.length === 0 ? '_No organization roles._' : value.map((role) => roleToMarkdown(role)).join('\n\n')
          )
        );
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_create_organization_role',
    {
      title: 'Create an organization role',
      description: 'Create a role in the organization template. Assign it to a member with logto_assign_organization_roles.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        name: z.string().min(1).max(128),
        description: z.string().max(256).optional(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ tenant_id, name, description, response_format }) => {
      try {
        const role = await client.requestForTenant<OrganizationRole>(tenant_id, 'api/organization-roles', {
          method: 'POST',
          body: omitUndefined({ name, description }),
        });

        return ok(render(role, response_format, roleToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_assign_organization_roles',
    {
      title: 'Assign organization roles to a member',
      description:
        'Assign organization roles to a user who is already a member. Pass role names from the organization template.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        organization_id: organizationIdSchema,
        user_id: z.string().min(1),
        organization_role_names: z.array(z.string().min(1)).min(1),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ tenant_id, organization_id, user_id, organization_role_names, response_format }) => {
      try {
        const result = await client.requestForTenant<{ organizationRoleIds: string[] }>(
          tenant_id,
          `api/organizations/${organization_id}/users/${user_id}/roles`,
          { method: 'POST', body: { organizationRoleNames: organization_role_names } }
        );

        return ok(
          render(result, response_format, (value) => `Assigned role IDs: ${value.organizationRoleIds.map((id) => `\`${id}\``).join(', ')}`)
        );
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );
};
