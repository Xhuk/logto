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
  publicUser,
  responseFormatSchema,
  tenantIdSchema,
  withQuery,
} from './shared.js';

const userIdSchema = z.string().min(1).describe('The user ID.');

type UserRecord = Record<string, unknown> & {
  id?: string;
  name?: string | null;
  username?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  isSuspended?: boolean;
};

const userToMarkdown = (user: UserRecord): string => {
  const safe = publicUser(user);

  return [
    `### ${String(safe.name ?? safe.username ?? safe.primaryEmail ?? safe.id)} (\`${String(safe.id)}\`)`,
    `- Username: ${safe.username ?? '—'}`,
    `- Email: ${safe.primaryEmail ?? '—'}`,
    `- Phone: ${safe.primaryPhone ?? '—'}`,
    `- Suspended: ${safe.isSuspended ? 'yes' : 'no'}`,
  ].join('\n');
};

const usersToMarkdown = (users: UserRecord[]): string =>
  users.length === 0 ? '_No users on this page._' : users.map((user) => userToMarkdown(user)).join('\n\n');

const showUser = (user: UserRecord, format: 'json' | 'markdown') =>
  render(publicUser(user), format, (value) => userToMarkdown(value as UserRecord));

/**
 * Register user tools, including the first administrator.
 *
 * Creating a user with a password on the admin tenant is the bootstrap that the console welcome
 * page performs. The console stays mounted so a person can open the same user and verify it.
 */
export const registerUserTools = (server: McpServer, client: LogtoClient): void => {
  server.registerTool(
    'logto_list_users',
    {
      title: 'List users in a tenant',
      description:
        'List users in a tenant. Search matches username, email, phone, name, or ID. The Admin Console user list shows the same records.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        search: z.string().min(1).optional().describe('Partial username, email, phone, name, or user ID.'),
        page: pageSchema,
        page_size: pageSizeSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, search, page, page_size, response_format }) => {
      try {
        const users = await client.requestForTenant<UserRecord[]>(
          tenant_id,
          withQuery('api/users', { search, page, page_size })
        );

        return ok(render(users.map((user) => publicUser(user)), response_format, (value) => usersToMarkdown(value as UserRecord[])));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_get_user',
    {
      title: 'Get a user',
      description: 'Get one user by ID. Password hashes are omitted.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        user_id: userIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, user_id, response_format }) => {
      try {
        const user = await client.requestForTenant<UserRecord>(tenant_id, `api/users/${user_id}`);

        return ok(showUser(user, response_format));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_create_user',
    {
      title: 'Create a user',
      description:
        'Create a user, including the first administrator. Provide at least one of username, primary email, or primary phone. A password lets that person sign in through the Experience page. This is the console welcome-page bootstrap. The Admin Console stays available so a person can verify the new user. The password is not returned.',
      inputSchema: z
        .object({
          tenant_id: tenantIdSchema,
          username: z.string().min(1).optional(),
          primary_email: z.string().min(1).optional().describe('Primary email address.'),
          primary_phone: z.string().min(1).optional().describe('Primary phone in E.164, for example +5215512345678.'),
          password: z.string().min(1).optional().describe('Plain password. Required for a person to sign in. Not echoed back.'),
          name: z.string().min(1).optional().describe('Display name.'),
          response_format: responseFormatSchema,
        })
        .refine((value) => value.username ?? value.primary_email ?? value.primary_phone, {
          message: 'Provide a username, primary email, or primary phone.',
        }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ tenant_id, username, primary_email, primary_phone, password, name, response_format }) => {
      try {
        const user = await client.requestForTenant<UserRecord>(tenant_id, 'api/users', {
          method: 'POST',
          body: omitUndefined({
            username,
            primaryEmail: primary_email,
            primaryPhone: primary_phone,
            password,
            name,
          }),
        });

        return ok(showUser(user, response_format));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_update_user',
    {
      title: 'Update a user',
      description: 'Update a user name, username, email, or phone. Empty string clears a field when Logto allows it.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        user_id: userIdSchema,
        name: z.string().nullable().optional(),
        username: z.string().nullable().optional(),
        primary_email: z.string().nullable().optional(),
        primary_phone: z.string().nullable().optional(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, user_id, name, username, primary_email, primary_phone, response_format }) => {
      try {
        const user = await client.requestForTenant<UserRecord>(tenant_id, `api/users/${user_id}`, {
          method: 'PATCH',
          body: omitUndefined({
            name,
            username,
            primaryEmail: primary_email,
            primaryPhone: primary_phone,
          }),
        });

        return ok(showUser(user, response_format));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_set_user_password',
    {
      title: 'Set a user password',
      description:
        'Replace a user password. The new password is not returned. A person can still sign in with it, and the console can verify that a password is set.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        user_id: userIdSchema,
        password: z.string().min(1),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, user_id, password, response_format }) => {
      try {
        const user = await client.requestForTenant<UserRecord>(
          tenant_id,
          `api/users/${user_id}/password`,
          { method: 'PATCH', body: { password } }
        );

        return ok(showUser(user, response_format));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_set_user_suspended',
    {
      title: 'Suspend or resume a user',
      description: 'Suspend or resume a user. A suspended user cannot sign in.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        user_id: userIdSchema,
        is_suspended: z.boolean(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, user_id, is_suspended, response_format }) => {
      try {
        const user = await client.requestForTenant<UserRecord>(
          tenant_id,
          `api/users/${user_id}/is-suspended`,
          { method: 'PATCH', body: { isSuspended: is_suspended } }
        );

        return ok(showUser(user, response_format));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_delete_user',
    {
      title: 'Delete a user',
      description: 'Permanently delete a user. This cannot be undone. Confirm in the Admin Console before relying on the deletion.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        user_id: userIdSchema,
        confirm: confirmSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, user_id }) => {
      try {
        await client.requestForTenant(tenant_id, `api/users/${user_id}`, { method: 'DELETE' });

        return ok(`Deleted user \`${user_id}\` from tenant \`${tenant_id}\`.`);
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );
};
