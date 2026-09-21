import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { render } from '../format.js';
import type { LogtoClient } from '../logto-client.js';

import { fail, ok, pageSchema, pageSizeSchema, responseFormatSchema, tenantIdSchema, withQuery } from './shared.js';

type ResourceScope = {
  id: string;
  name: string;
  description?: string | null;
};

type Resource = {
  id: string;
  name: string;
  indicator: string;
  scopes?: ResourceScope[];
};

const resourceToMarkdown = (resource: Resource): string =>
  [
    `### ${resource.name} (\`${resource.id}\`)`,
    `- Indicator: \`${resource.indicator}\``,
    ...(resource.scopes
      ? [
          `- Scopes: ${
            resource.scopes.length === 0
              ? '_none_'
              : resource.scopes.map((scope) => `\`${scope.name}\` (\`${scope.id}\`)`).join(', ')
          }`,
        ]
      : []),
  ].join('\n');

/**
 * Register API resource tools. A scope is one piece of data an application may request.
 * Attach scope IDs to a machine-to-machine role, then assign that role to the application.
 */
export const registerResourceTools = (server: McpServer, client: LogtoClient): void => {
  server.registerTool(
    'logto_list_resources',
    {
      title: 'List API resources',
      description: 'List API resources and their scopes. The indicator is the access-token audience.',
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
        const resources = await client.requestForTenant<Resource[]>(
          tenant_id,
          withQuery('api/resources', { page, page_size, includeScopes: true })
        );

        return ok(
          render(resources, response_format, (value) =>
            value.length === 0 ? '_No API resources._' : value.map((resource) => resourceToMarkdown(resource)).join('\n\n')
          )
        );
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_create_resource',
    {
      title: 'Create an API resource',
      description:
        'Create an API resource. The indicator is the audience (`aud`) clients request, for example https://api.example.com.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        name: z.string().min(1).max(256),
        indicator: z.string().min(1).describe('Absolute resource indicator used as the token audience.'),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ tenant_id, name, indicator, response_format }) => {
      try {
        const resource = await client.requestForTenant<Resource>(tenant_id, 'api/resources', {
          method: 'POST',
          body: { name, indicator },
        });

        return ok(render(resource, response_format, resourceToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_create_resource_scope',
    {
      title: 'Create an API resource scope',
      description:
        'Create a scope on an API resource. The returned ID is what logto_create_role accepts in scope_ids. Scope names cannot contain spaces.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        resource_id: z.string().min(1),
        name: z.string().min(1).max(256).describe('Scope name, for example read:orders. No spaces.'),
        description: z.string().max(256).optional(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ tenant_id, resource_id, name, description, response_format }) => {
      try {
        const scope = await client.requestForTenant<ResourceScope>(
          tenant_id,
          `api/resources/${resource_id}/scopes`,
          { method: 'POST', body: { name, description } }
        );

        return ok(
          render(scope, response_format, (value) => `### \`${value.name}\` (\`${value.id}\`)\n- Description: ${value.description ?? '—'}`)
        );
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );
};
