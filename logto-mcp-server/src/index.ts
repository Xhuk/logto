import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { loadConfig } from './config.js';
import { LogtoClient } from './logto-client.js';
import { registerApplicationTools } from './tools/applications.js';
import { registerDomainTools } from './tools/domains.js';
import { registerTenantTools } from './tools/tenants.js';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const client = new LogtoClient(config);

  const server = new McpServer({
    name: 'logto-mcp-server',
    version: '0.1.0',
  });

  registerTenantTools(server, client);
  registerApplicationTools(server, client);
  registerDomainTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // A stdio MCP server must never write to stdout: it is reserved for the protocol. Use stderr.
  console.error(`logto-mcp-server ready. Management API endpoint: ${config.endpoint.href}`);
};

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
