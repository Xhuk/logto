import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { render } from '../format.js';
import type { LogtoClient } from '../logto-client.js';

import { configKeyList, confirmSchema, fail, ok, omitUndefined, responseFormatSchema, tenantIdSchema } from './shared.js';

type Connector = {
  id: string;
  connectorId?: string;
  syncProfile?: boolean;
  metadata?: { name?: string; target?: string };
  config?: Record<string, unknown>;
};

const connectorIdSchema = z.string().min(1).describe('The connector instance ID (not the factory ID).');

const connectorToMarkdown = (connector: Connector): string =>
  [
    `### ${connector.metadata?.name ?? connector.connectorId ?? connector.id} (\`${connector.id}\`)`,
    `- Factory: \`${connector.connectorId ?? '—'}\``,
    `- Target: \`${connector.metadata?.target ?? '—'}\``,
    `- Sync profile: ${connector.syncProfile ? 'yes' : 'no'}`,
    `- Config keys: ${configKeyList(connector.config)}`,
  ].join('\n');

const connectorsToMarkdown = (connectors: Connector[]): string =>
  connectors.length === 0
    ? '_No connectors configured._'
    : connectors.map((connector) => connectorToMarkdown(connector)).join('\n\n');

/**
 * Register connector tools. Markdown hides config values because they hold SMTP and OAuth secrets.
 * JSON includes the config so the agent can patch it. A person can open the same connector in the
 * Admin Console to verify it.
 */
export const registerConnectorTools = (server: McpServer, client: LogtoClient): void => {
  server.registerTool(
    'logto_list_connectors',
    {
      title: 'List connectors',
      description:
        'List connectors configured in a tenant. Markdown lists config keys only. Use json when the config values are required.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, response_format }) => {
      try {
        const connectors = await client.requestForTenant<Connector[]>(tenant_id, 'api/connectors');

        return ok(render(connectors, response_format, connectorsToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_get_connector',
    {
      title: 'Get a connector',
      description: 'Get one connector by instance ID. Markdown omits config values.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        connector_id: connectorIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, connector_id, response_format }) => {
      try {
        const connector = await client.requestForTenant<Connector>(tenant_id, `api/connectors/${connector_id}`);

        return ok(render(connector, response_format, connectorToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_create_connector',
    {
      title: 'Create a connector',
      description:
        'Create a connector from a factory ID such as `smtp`, `google`, or `http-email`. The config object must match that factory. The Admin Console connector page shows the same instance.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        connector_id: z.string().min(1).describe('Factory ID, for example smtp or google.'),
        config: z.record(z.string(), z.unknown()).describe('Factory-specific config. Do not invent keys.'),
        sync_profile: z.boolean().optional().describe('Sync the profile from the provider on every sign-in.'),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ tenant_id, connector_id, config, sync_profile, response_format }) => {
      try {
        const connector = await client.requestForTenant<Connector>(tenant_id, 'api/connectors', {
          method: 'POST',
          body: omitUndefined({ connectorId: connector_id, config, syncProfile: sync_profile }),
        });

        return ok(render(connector, response_format, connectorToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_update_connector',
    {
      title: 'Update a connector',
      description: 'Replace a connector config or sync-profile flag. Config is a partial update on the server.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        connector_id: connectorIdSchema,
        config: z.record(z.string(), z.unknown()).optional(),
        sync_profile: z.boolean().optional(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, connector_id, config, sync_profile, response_format }) => {
      try {
        const connector = await client.requestForTenant<Connector>(tenant_id, `api/connectors/${connector_id}`, {
          method: 'PATCH',
          body: omitUndefined({ config, syncProfile: sync_profile }),
        });

        return ok(render(connector, response_format, connectorToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_delete_connector',
    {
      title: 'Delete a connector',
      description: 'Delete a connector instance. Sign-in methods that depend on it stop working.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        connector_id: connectorIdSchema,
        confirm: confirmSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ tenant_id, connector_id }) => {
      try {
        await client.requestForTenant(tenant_id, `api/connectors/${connector_id}`, { method: 'DELETE' });

        return ok(`Deleted connector \`${connector_id}\` from tenant \`${tenant_id}\`.`);
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );
};
