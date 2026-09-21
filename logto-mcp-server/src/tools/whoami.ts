import type { McpServer } from '@modelcontextprotocol/server';
import { getAuthInfo } from 'mcp-auth';

/**
 * Staff identity from the Cursor OAuth access token. Only registered in HTTP mode:
 * stdio has no user token.
 */
export const registerWhoamiTool = (server: McpServer): void => {
  server.registerTool(
    'logto_whoami',
    {
      title: 'Show the authenticated staff identity',
      description:
        'Return the `sub` and claims from the Cursor OAuth token. Use this to confirm active auth is working.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (context) => {
      try {
        const { subject, claims, scopes, issuer } = getAuthInfo(context);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ subject, issuer, scopes, claims }, null, 2),
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
