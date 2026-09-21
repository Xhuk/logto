import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { render } from '../format.js';
import type { LogtoClient } from '../logto-client.js';

import { confirmSchema, fail, ok, omitUndefined, responseFormatSchema, tenantIdSchema, withQuery } from './shared.js';

type Hook = {
  id: string;
  name: string;
  events: string[];
  config?: { url?: string };
};

const hookIdSchema = z.string().min(1).describe('The hook ID.');

const eventsSchema = z
  .array(z.string().min(1))
  .min(1)
  .describe('Hook events, for example PostRegister, PostSignIn, User.Created, User.Data.Updated.');

const hookToMarkdown = (hook: Hook): string =>
  [
    `### ${hook.name} (\`${hook.id}\`)`,
    `- URL: ${hook.config?.url ?? '—'}`,
    `- Events: ${hook.events.join(', ')}`,
  ].join('\n');

const hooksToMarkdown = (hooks: Hook[]): string =>
  hooks.length === 0 ? '_No hooks._' : hooks.map((hook) => hookToMarkdown(hook)).join('\n\n');

/** Register webhook tools. Delivery stays on the core. The Admin Console hook page shows the same rows. */
export const registerHookTools = (server: McpServer, client: LogtoClient): void => {
  server.registerTool(
    'logto_list_hooks',
    {
      title: 'List hooks',
      description: 'List webhooks configured in a tenant.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        page: z.number().int().min(1).optional(),
        page_size: z.number().int().min(1).max(100).optional(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, page, page_size, response_format }) => {
      try {
        const hooks = await client.requestForTenant<Hook[]>(
          tenant_id,
          withQuery('api/hooks', { page, page_size })
        );

        return ok(render(hooks, response_format, hooksToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_get_hook',
    {
      title: 'Get a hook',
      description: 'Get one webhook by ID.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        hook_id: hookIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, hook_id, response_format }) => {
      try {
        const hook = await client.requestForTenant<Hook>(tenant_id, `api/hooks/${hook_id}`);

        return ok(render(hook, response_format, hookToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_create_hook',
    {
      title: 'Create a hook',
      description:
        'Create a webhook. Logto POSTs the selected events to the URL. A person can open the hook in the Admin Console and send a test.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        name: z.string().min(1).max(256),
        events: eventsSchema,
        url: z.string().url(),
        headers: z.record(z.string(), z.string()).optional().describe('Extra request headers. Do not put secrets in the tool result afterwards.'),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ tenant_id, name, events, url, headers, response_format }) => {
      try {
        const hook = await client.requestForTenant<Hook>(tenant_id, 'api/hooks', {
          method: 'POST',
          body: {
            name,
            events,
            config: omitUndefined({ url, headers }),
          },
        });

        return ok(render(hook, response_format, hookToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_update_hook',
    {
      title: 'Update a hook',
      description: 'Update a webhook name, events, or URL.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        hook_id: hookIdSchema,
        name: z.string().min(1).max(256).optional(),
        events: eventsSchema.optional(),
        url: z.string().url().optional(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, hook_id, name, events, url, response_format }) => {
      try {
        const hook = await client.requestForTenant<Hook>(tenant_id, `api/hooks/${hook_id}`, {
          method: 'PATCH',
          body: omitUndefined({
            name,
            events,
            config: url ? { url } : undefined,
          }),
        });

        return ok(render(hook, response_format, hookToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_delete_hook',
    {
      title: 'Delete a hook',
      description: 'Delete a webhook. Events stop being delivered.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        hook_id: hookIdSchema,
        confirm: confirmSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, hook_id }) => {
      try {
        await client.requestForTenant(tenant_id, `api/hooks/${hook_id}`, { method: 'DELETE' });

        return ok(`Deleted hook \`${hook_id}\` from tenant \`${tenant_id}\`.`);
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );
};
