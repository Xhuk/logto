import type { McpServer } from '@modelcontextprotocol/server';
import { getAuthInfo } from 'mcp-auth';

import type { LogtoClient } from '../logto-client.js';

/**
 * Staff identity from the OAuth access token. Only registered in HTTP mode:
 * stdio has no user token.
 *
 * `access` is the write scope. `control-plane` configures every tenant.
 * `tenant-admin` configures only `tenantIds`.
 */
export const registerWhoamiTool = (server: McpServer, client: LogtoClient): void => {
  server.registerTool(
    'logto_whoami',
    {
      title: 'Show the OAuth login and which tenants it can configure',
      description:
        'Return the OAuth subject and its write scope. control-plane can create machine configs for every tenant. tenant-admin can create them only for tenantIds.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (context) => {
      try {
        const { subject, claims, scopes, issuer } = getAuthInfo(context);
        const access = await client.accessScope();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ subject, issuer, scopes, claims, access }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Not authenticated: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
};
