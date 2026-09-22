import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { LogtoApiError, type LogtoClient } from '../logto-client.js';
import { render } from '../format.js';

import { fail, ok, responseFormatSchema, tenantIdSchema, withQuery } from './shared.js';

type Application = { id: string; name: string; type: string };
type Scope = { id: string; name: string };
type Resource = { id: string; name: string; indicator: string; scopes?: Scope[] };
type Role = { id: string; name: string; type?: string };
type Secret = { name: string; value?: string };

export type TenantApi = {
  get(path: string): Promise<unknown>;
  send(path: string, method: 'POST', body?: unknown): Promise<unknown>;
};

export type ExplicitAuth = {
  grantType: 'client_credentials';
  tenantId: string;
  applicationId: string;
  clientId: string;
  clientSecret: string | null;
  secretName: string;
  resource: string;
  scope: string;
  roleId: string;
  tokenEndpoints: {
    vpsHostNamespace: string;
    configuredTenant: string;
  };
  issuer: string;
  callers: {
    vpsHostNamespace: string;
    lotlyContainer: string;
    browser: string;
    adminAndIde: string;
  };
  oauth?: {
    mode: string;
    subject?: string;
    tenantIds?: string[];
  };
};

const alreadyThere = (error: unknown): boolean =>
  error instanceof LogtoApiError &&
  (error.code === 'role.application_exists' || error.code === 'role.scope_exists');

/** Token URL for a process in the VPS host network namespace. Not a container and not a browser. */
export const vpsHostTokenEndpoint = (tenantId: string): string =>
  `http://127.0.0.1:13101/${tenantId}/oidc/token`;

export const oidcTokenEndpoint = (base: URL): string => new URL('oidc/token', base).href;

export const oidcIssuer = (base: URL): string => new URL('oidc', base).href.replace(/\/$/, '');

const explicitAuthToMarkdown = (auth: ExplicitAuth): string =>
  [
    `### Explicit auth for \`${auth.clientId}\``,
    `- Grant: \`${auth.grantType}\``,
    `- Tenant: \`${auth.tenantId}\``,
    `- Client ID: \`${auth.clientId}\``,
    `- Client secret (${auth.secretName}): ${auth.clientSecret ? `\`${auth.clientSecret}\`` : '_already stored; this call did not return it_'}`,
    `- Resource (aud): \`${auth.resource}\``,
    `- Scope: \`${auth.scope}\``,
    `- Role: \`${auth.roleId}\``,
    `- Issuer: \`${auth.issuer}\``,
    `- Token URL, VPS host namespace: \`${auth.tokenEndpoints.vpsHostNamespace}\``,
    `- Token URL, endpoint configured on this MCP: \`${auth.tokenEndpoints.configuredTenant}\``,
    `- ${auth.callers.vpsHostNamespace}`,
    `- ${auth.callers.lotlyContainer}`,
    `- ${auth.callers.browser}`,
    `- ${auth.callers.adminAndIde}`,
    `- OAuth: \`${auth.oauth?.mode ?? 'unknown'}\`${auth.oauth?.tenantIds ? ` tenants ${auth.oauth.tenantIds.join(', ')}` : ''}`,
    '- Store the client secret. A later call does not return it. The Admin Console application page shows the same app.',
  ].join('\n');

const findByName = <T extends { name: string }>(rows: T[], name: string): T | undefined =>
  rows.find((row) => row.name === name);

export const provisionMachineClient = async (
  api: TenantApi,
  input: {
    tenantId: string;
    name: string;
    secretName: string;
    rotateSecret: boolean;
    resourceIndicator: string;
    resourceName: string;
    scopes: string[];
    roleName: string;
    configuredBase: URL;
    managementResource: boolean;
  }
): Promise<ExplicitAuth> => {
  const applications = (await api.get(withQuery('api/applications', { page_size: 100 }))) as Application[];
  const existing = applications.find(
    (application) => application.name === input.name && application.type === 'MachineToMachine'
  );
  const application =
    existing ??
    ((await api.send('api/applications', 'POST', {
      name: input.name,
      type: 'MachineToMachine',
      description: 'Explicit client-credentials client for an app or an LLM.',
    })) as Application);

  const secrets = (await api.get(`api/applications/${application.id}/secrets`)) as Secret[];
  const named = findByName(secrets, input.secretName);
  let clientSecret: string | null = null;

  if (!named || input.rotateSecret) {
    const created = (await api.send(`api/applications/${application.id}/secrets`, 'POST', {
      name: input.rotateSecret && named ? `${input.secretName}-${Date.now()}` : input.secretName,
    })) as Secret;
    clientSecret = created.value ?? null;
  }

  const resources = (await api.get(
    withQuery('api/resources', { page_size: 100, includeScopes: true })
  )) as Resource[];
  const resource =
    resources.find((item) => item.indicator === input.resourceIndicator) ??
    ((await api.send('api/resources', 'POST', {
      name: input.resourceName,
      indicator: input.resourceIndicator,
    })) as Resource);

  const scopes: Scope[] = [];

  for (const scopeName of input.scopes) {
    const known = resource.scopes?.find((scope) => scope.name === scopeName);

    if (known) {
      scopes.push(known);
      continue;
    }

    if (input.managementResource) {
      throw new Error(
        `Scope "${scopeName}" is not on the Management API resource ${input.resourceIndicator}. That resource does not accept new scopes.`
      );
    }

    scopes.push(
      (await api.send(`api/resources/${resource.id}/scopes`, 'POST', { name: scopeName })) as Scope
    );
  }

  const roles = (await api.get(
    withQuery('api/roles', { type: 'MachineToMachine', page_size: 100 })
  )) as Role[];
  const role =
    findByName(roles, input.roleName) ??
    ((await api.send('api/roles', 'POST', {
      name: input.roleName,
      type: 'MachineToMachine',
      scopeIds: scopes.map((scope) => scope.id),
    })) as Role);

  if (findByName(roles, input.roleName)) {
    try {
      await api.send(`api/roles/${role.id}/scopes`, 'POST', {
        scopeIds: scopes.map((scope) => scope.id),
      });
    } catch (error) {
      if (!alreadyThere(error)) {
        throw error;
      }
    }
  }

  try {
    await api.send(`api/roles/${role.id}/applications`, 'POST', {
      applicationIds: [application.id],
    });
  } catch (error) {
    if (!alreadyThere(error)) {
      throw error;
    }
  }

  const base = input.configuredBase;

  return {
    grantType: 'client_credentials',
    tenantId: input.tenantId,
    applicationId: application.id,
    clientId: application.id,
    clientSecret,
    secretName: input.secretName,
    resource: input.resourceIndicator,
    scope: input.scopes.join(' '),
    roleId: role.id,
    tokenEndpoints: {
      vpsHostNamespace: vpsHostTokenEndpoint(input.tenantId),
      configuredTenant: oidcTokenEndpoint(base),
    },
    issuer: oidcIssuer(base),
    callers: {
      vpsHostNamespace:
        'Use the VPS host token URL only from a process in the host network namespace.',
      lotlyContainer:
        'A container with network_mode service:tailscale does not reach host port 13101. Do not copy either token URL into that LOGTO_ENDPOINT.',
      browser: 'This grant is not a browser login. Do not put the client secret in Vite.',
      adminAndIde:
        'Tailscale katra-imperial is the admin console and the IDE MCP path. It is not this client.',
    },
  };
};

export const registerExplicitAuthTools = (server: McpServer, client: LogtoClient): void => {
  server.registerTool(
    'logto_provision_machine_client',
    {
      title: 'Provision explicit machine auth',
      description:
        'Create or reuse a Machine-to-machine application, its client secret, and a role that can request an API. Returns the client-credentials fields an app or an LLM needs: client id, secret (once), resource, scope, and the token URL for each caller. Store the secret. A later call does not return it. Confirm the application in the Admin Console.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        name: z.string().min(1).max(256).describe('Application name. Reused when the same Machine-to-machine name already exists.'),
        secret_name: z.string().min(1).max(128).default('machine').describe('Secret label. Default "machine".'),
        rotate_secret: z
          .boolean()
          .default(false)
          .describe('When true, create another secret even if secret_name already exists. The new value is returned once.'),
        resource_indicator: z
          .string()
          .min(1)
          .optional()
          .describe('Token audience. Omit to use this tenant Management API indicator, for example https://{tenantId}.logto.app/api.'),
        resource_name: z.string().min(1).max(256).optional().describe('Name used only when the resource must be created.'),
        scopes: z
          .array(z.string().min(1))
          .optional()
          .describe('Scope names. Default ["all"] on the Management API. Custom resources get a scope created when it is missing. Names have no spaces.'),
        role_name: z.string().min(1).max(128).optional().describe('Machine-to-machine role name. Defaults to the application name.'),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({
      tenant_id,
      name,
      secret_name,
      rotate_secret,
      resource_indicator,
      resource_name,
      scopes,
      role_name,
      response_format,
    }) => {
      try {
        const managementResource = client.managementResource(tenant_id);
        const indicator = resource_indicator ?? managementResource;
        const auth = await provisionMachineClient(
          {
            get: (path) => client.requestForTenant(tenant_id, path),
            send: (path, method, body) => client.requestForTenant(tenant_id, path, { method, body }),
          },
          {
            tenantId: tenant_id,
            name,
            secretName: secret_name,
            rotateSecret: rotate_secret,
            resourceIndicator: indicator,
            resourceName: resource_name ?? name,
            scopes: scopes ?? ['all'],
            roleName: role_name ?? name,
            configuredBase: client.tenantEndpoint(tenant_id),
            managementResource: indicator === managementResource,
          }
        );

        const oauth = await client.accessScope();

        return ok(
          render(
            {
              ...auth,
              oauth: {
                mode: oauth.mode,
                subject: 'subject' in oauth ? oauth.subject : undefined,
                tenantIds: 'tenantIds' in oauth ? oauth.tenantIds : undefined,
              },
            },
            response_format,
            explicitAuthToMarkdown
          )
        );
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );
};
