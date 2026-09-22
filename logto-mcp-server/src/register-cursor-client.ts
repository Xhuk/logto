#!/usr/bin/env node

/**
 * Idempotent bootstrap of the Cursor OAuth client against a Logto tenant:
 * API resource (MCP audience), `mcp:all` scope, staff role, Native app with
 * Cursor redirect URIs, optional role assignment.
 *
 * Uses the same M2M credentials as the MCP server. Prints the public client
 * id for `mcp.json` `auth.CLIENT_ID`. Never prints secrets.
 */

import { cursorRedirectUris, loadConfig } from './config.js';
import { applyDotEnv } from './env-file.js';
import { LogtoClient } from './logto-client.js';

const resourceName = 'Katra staff MCP';
const applicationName = 'Cursor staff MCP';
const roleName = 'Staff MCP';
const scopeName = 'mcp:all';

type Resource = { id: string; name: string; indicator: string };
type Scope = { id: string; name: string; resourceId: string };
type Role = { id: string; name: string };
type Application = { id: string; name: string; type: string };

const asList = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const main = async (): Promise<void> => {
  applyDotEnv();
  const config = loadConfig({
    ...process.env,
    MCP_HTTP_PORT: process.env.MCP_HTTP_PORT ?? '3301',
  });
  const http = config.http;

  if (!http) {
    throw new Error('MCP_HTTP_PORT / MCP_PUBLIC_URL is required to know the OAuth resource indicator.');
  }

  const issuerOrigin = new URL(http.issuer).origin;
  const apiOrigin = config.endpoint.origin;

  if (issuerOrigin !== apiOrigin) {
    console.error(
      `OAuth issuer ${issuerOrigin} is not the Management API host ${apiOrigin}. ` +
        `This script registers the Cursor app on the API host. For Tailscale admin, ` +
        `point LOGTO_ENDPOINT at that host and use an admin-tenant M2M client.`
    );
  }

  const client = new LogtoClient(config);
  const staffUserId = process.env.LOGTO_MCP_STAFF_USER_ID?.trim();

  const resource = await ensureResource(client, http.oauthResource);
  const scope = await ensureScope(client, resource.id);
  const role = await ensureRole(client, scope.id);
  const application = await ensureApplication(client);
  await maybeAssignRole(client, role.id, staffUserId);

  const snippet = {
    mcpServers: {
      'logto-vps': {
        url: http.publicUrl.href.replace(/\/$/, ''),
        auth: {
          CLIENT_ID: application.id,
          scopes: [...http.oauthScopes],
        },
      },
    },
  };

  console.log(
    JSON.stringify(
      {
        resource: { id: resource.id, indicator: resource.indicator },
        scope: { id: scope.id, name: scope.name },
        role: { id: role.id, name: role.name },
        application: { id: application.id, name: application.name, type: application.type },
        issuer: http.issuer,
        mcpJson: snippet,
        staffUserAssigned: Boolean(staffUserId),
      },
      null,
      2
    )
  );
};

const ensureResource = async (client: LogtoClient, indicator: string): Promise<Resource> => {
  const resources = asList<Resource>(await client.request('api/resources?page_size=100'));
  const existing = resources.find((item) => item.indicator === indicator);

  if (existing) {
    return existing;
  }

  return client.request<Resource>('api/resources', {
    method: 'POST',
    body: { name: resourceName, indicator },
  });
};

const ensureScope = async (client: LogtoClient, resourceId: string): Promise<Scope> => {
  const scopes = asList<Scope>(
    await client.request(`api/resources/${resourceId}/scopes?page_size=100`)
  );
  const existing = scopes.find((item) => item.name === scopeName);

  if (existing) {
    return existing;
  }

  return client.request<Scope>(`api/resources/${resourceId}/scopes`, {
    method: 'POST',
    body: { name: scopeName, description: 'Full access to the Katra staff MCP' },
  });
};

const ensureRole = async (client: LogtoClient, scopeId: string): Promise<Role> => {
  const roles = asList<Role>(await client.request('api/roles?page_size=100'));
  const existing = roles.find((item) => item.name === roleName);

  if (existing) {
    const assigned = asList<{ id: string }>(await client.request(`api/roles/${existing.id}/scopes`));

    if (!assigned.some((item) => item.id === scopeId)) {
      await client.request(`api/roles/${existing.id}/scopes`, {
        method: 'POST',
        body: { scopeIds: [scopeId] },
      });
    }

    return existing;
  }

  return client.request<Role>('api/roles', {
    method: 'POST',
    body: {
      name: roleName,
      description: 'Staff users who may connect Cursor to the Katra MCP',
      type: 'User',
      scopeIds: [scopeId],
    },
  });
};

const ensureApplication = async (client: LogtoClient): Promise<Application> => {
  const applications = asList<Application>(
    await client.request('api/applications?page_size=100&isThirdParty=false')
  );
  const existing = applications.find((item) => item.name === applicationName);

  if (existing) {
    await client.request(`api/applications/${existing.id}`, {
      method: 'PATCH',
      body: {
        oidcClientMetadata: {
          redirectUris: [...cursorRedirectUris],
          postLogoutRedirectUris: [],
        },
      },
    });

    return existing;
  }

  return client.request<Application>('api/applications', {
    method: 'POST',
    body: {
      name: applicationName,
      type: 'Native',
      description: 'Cursor IDE OAuth client for the Katra staff MCP (PKCE, no client secret).',
      oidcClientMetadata: {
        redirectUris: [...cursorRedirectUris],
        postLogoutRedirectUris: [],
      },
      customClientMetadata: {
        alwaysIssueRefreshToken: true,
      },
    },
  });
};

const maybeAssignRole = async (
  client: LogtoClient,
  roleId: string,
  userId: string | undefined
): Promise<void> => {
  if (!userId) {
    return;
  }

  try {
    await client.request(`api/roles/${roleId}/users`, {
      method: 'POST',
      body: { userIds: [userId] },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!/exist|already been added/i.test(message)) {
      throw error;
    }
  }
};

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
