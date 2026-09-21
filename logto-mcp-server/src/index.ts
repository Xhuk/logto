#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { loadConfig } from './config.js';
import { createLogtoMcpServer } from './create-mcp-server.js';
import { applyDotEnv } from './env-file.js';
import { startHttpServer } from './http.js';
import { LogtoClient } from './logto-client.js';

const main = async (): Promise<void> => {
  applyDotEnv();
  const config = loadConfig();
  const client = new LogtoClient(config);

  if (config.http) {
    await startHttpServer(config, client);
    return;
  }

  const server = createLogtoMcpServer(client, { includeWhoami: false });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // A stdio MCP server must never write to stdout: it is reserved for the protocol. Use stderr.
  console.error(`logto-mcp-server ready (stdio). Management API endpoint: ${config.endpoint.href}`);
};

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
