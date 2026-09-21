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

const roleTypeSchema = z
  .enum(['User', 'MachineToMachine'])
  .describe('User roles are assigned to people. MachineToMachine roles are assigned to applications and carry API scopes.');

type Role = {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
};

const roleIdSchema = z.string().min(1).describe('The role ID.');

const roleToMarkdown = (role: Role): string =>
  [
    `### ${role.name} (\`${role.id}\`)`,
    `- Type: \`${role.type ?? 'User'}\``,
    `- Description: ${role.description ?? '—'}`,
  ].join('\n');

const rolesToMarkdown = (roles: Role[]): string =>
  roles.length === 0 ? '_No roles on this page._' : roles.map((role) => roleToMarkdown(role)).join('\n\n');

/**
 * Register API RBAC role tools. Scopes come from API resources (`logto_create_resource_scope`).
 * Machine-to-machine apps receive data access by assigning one of these roles.
 */
export const registerRoleTools = (server: McpServer, client: LogtoClient): void => {
  server.registerTool(
    'logto_list_roles',
    {
      title: 'List roles',
      description: 'List user or machine-to-machine roles in a tenant.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        type: roleTypeSchema.optional().describe('Filter by role type. Omit to list both.'),
        page: pageSchema,
        page_size: pageSizeSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, type, page, page_size, response_format }) => {
      try {
        const roles = await client.requestForTenant<Role[]>(
          tenant_id,
          withQuery('api/roles', { type, page, page_size })
        );

        return ok(render(roles, response_format, rolesToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_get_role',
    {
      title: 'Get a role',
      description: 'Get one role by ID.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        role_id: roleIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, role_id, response_format }) => {
      try {
        const role = await client.requestForTenant<Role>(tenant_id, `api/roles/${role_id}`);

        return ok(render(role, response_format, roleToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_create_role',
    {
      title: 'Create a role',
      description:
        'Create a role. Pass scope IDs from logto_create_resource_scope when the role should grant API access. Type cannot be changed later.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        name: z.string().min(1).max(128),
        description: z.string().max(256).optional(),
        type: roleTypeSchema.default('User'),
        scope_ids: z.array(z.string().min(1)).optional().describe('API resource scope IDs to attach at creation.'),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ tenant_id, name, description, type, scope_ids, response_format }) => {
      try {
        const role = await client.requestForTenant<Role>(tenant_id, 'api/roles', {
          method: 'POST',
          body: omitUndefined({ name, description, type, scopeIds: scope_ids }),
        });

        return ok(render(role, response_format, roleToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_update_role',
    {
      title: 'Update a role',
      description: 'Update a role name and/or description. The type stays as it was created.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        role_id: roleIdSchema,
        name: z.string().min(1).max(128).optional(),
        description: z.string().max(256).nullable().optional(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, role_id, name, description, response_format }) => {
      try {
        const role = await client.requestForTenant<Role>(tenant_id, `api/roles/${role_id}`, {
          method: 'PATCH',
          body: omitUndefined({ name, description }),
        });

        return ok(render(role, response_format, roleToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_delete_role',
    {
      title: 'Delete a role',
      description: 'Permanently delete a role and its assignments.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        role_id: roleIdSchema,
        confirm: confirmSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, role_id }) => {
      try {
        await client.requestForTenant(tenant_id, `api/roles/${role_id}`, { method: 'DELETE' });

        return ok(`Deleted role \`${role_id}\` from tenant \`${tenant_id}\`.`);
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_assign_role_to_users',
    {
      title: 'Assign a user role to users',
      description: 'Assign a role of type User to one or more users. Machine-to-machine roles are rejected by the API.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        role_id: roleIdSchema,
        user_ids: z.array(z.string().min(1)).min(1),
      }),
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ tenant_id, role_id, user_ids }) => {
      try {
        await client.requestForTenant(tenant_id, `api/roles/${role_id}/users`, {
          method: 'POST',
          body: { userIds: user_ids },
        });

        return ok(`Assigned role \`${role_id}\` to ${user_ids.length} user(s) in tenant \`${tenant_id}\`.`);
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_assign_role_to_applications',
    {
      title: 'Assign a machine-to-machine role to applications',
      description:
        'Assign a MachineToMachine role to applications. This is how an app is allowed to request the scopes on that role. The token then carries those scopes. A person can confirm the assignment in the Admin Console.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        role_id: roleIdSchema,
        application_ids: z.array(z.string().min(1)).min(1),
      }),
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ tenant_id, role_id, application_ids }) => {
      try {
        await client.requestForTenant(tenant_id, `api/roles/${role_id}/applications`, {
          method: 'POST',
          body: { applicationIds: application_ids },
        });

        return ok(
          `Assigned role \`${role_id}\` to ${application_ids.length} application(s) in tenant \`${tenant_id}\`.`
        );
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );
};
