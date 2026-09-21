import { McpServer } from '@modelcontextprotocol/server';

import type { LogtoClient } from './logto-client.js';
import { registerApplicationTools } from './tools/applications.js';
import { registerConnectorTools } from './tools/connectors.js';
import { registerDomainTools } from './tools/domains.js';
import { registerHookTools } from './tools/hooks.js';
import { registerOrganizationTools } from './tools/organizations.js';
import { registerResourceTools } from './tools/resources.js';
import { registerRoleTools } from './tools/roles.js';
import { registerSignInExperienceTools } from './tools/sign-in-experience.js';
import { registerTenantTools } from './tools/tenants.js';
import { registerUserTools } from './tools/users.js';
import { registerWhoamiTool } from './tools/whoami.js';

export const mcpServerInfo = {
  name: 'logto-mcp-server',
  version: '0.1.0',
} as const;

export const createLogtoMcpServer = (
  client: LogtoClient,
  options: { includeWhoami: boolean }
): McpServer => {
  const server = new McpServer({
    name: mcpServerInfo.name,
    version: mcpServerInfo.version,
  });

  registerTenantTools(server, client);
  registerApplicationTools(server, client);
  registerDomainTools(server, client);
  registerUserTools(server, client);
  registerOrganizationTools(server, client);
  registerResourceTools(server, client);
  registerRoleTools(server, client);
  registerConnectorTools(server, client);
  registerSignInExperienceTools(server, client);
  registerHookTools(server, client);

  if (options.includeWhoami) {
    registerWhoamiTool(server);
  }

  return server;
};
