import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { render } from '../format.js';
import type { LogtoClient } from '../logto-client.js';

import { omitUndefined } from './shared.js';

const responseFormatSchema = z
  .enum(['json', 'markdown'])
  .default('markdown')
  .describe('Output format. Use "json" for programmatic processing, "markdown" for readability.');

const tenantIdSchema = z
  .string()
  .min(1)
  .describe('The tenant (project) ID that owns the application.');

const applicationIdSchema = z.string().min(1).describe('The application ID.');

const applicationTypeSchema = z
  .enum(['Native', 'SPA', 'Traditional', 'MachineToMachine', 'Protected'])
  .describe('Logto application type. "Traditional" is a server-side web app with a client secret.');

type OidcClientMetadata = {
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
};

type CustomClientMetadata = {
  corsAllowedOrigins?: string[];
};

export type Application = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  oidcClientMetadata?: OidcClientMetadata;
  customClientMetadata?: CustomClientMetadata;
};

const uriListSchema = z
  .array(z.string().min(1))
  .max(50)
  .describe(
    'Absolute redirect URIs, including custom schemes such as cursor://. Replaces the previous list when sent.'
  );

export type ApplicationSecret = {
  applicationId: string;
  name: string;
  value?: string;
  createdAt: number;
  expiresAt: number | null;
};

const text = (value: string) => ({ type: 'text' as const, text: value });
const ok = (value: string) => ({ content: [text(value)] });

const fail = (error: unknown, tenantId?: string) => ({
  isError: true,
  content: [
    text(
      `Error: ${error instanceof Error ? error.message : String(error)}. ` +
        (tenantId
          ? `Verify the tenant ID ("${tenantId}"), that the tenant is reachable at its configured endpoint, and that the machine-to-machine app is granted the Management API scope on that tenant.`
          : 'Verify the application ID and the machine-to-machine app scope.')
    ),
  ],
});

const listLine = (label: string, values: string[] | undefined): string =>
  `- ${label}: ${values && values.length > 0 ? values.map((value) => `\`${value}\``).join(', ') : '—'}`;

export const applicationToMarkdown = (application: Application): string =>
  [
    `### ${application.name} (\`${application.id}\`)`,
    `- Type: \`${application.type}\``,
    `- Description: ${application.description ?? '—'}`,
    listLine('Redirect URIs', application.oidcClientMetadata?.redirectUris),
    listLine('Post-logout redirect URIs', application.oidcClientMetadata?.postLogoutRedirectUris),
    listLine('CORS origins', application.customClientMetadata?.corsAllowedOrigins),
  ].join('\n');

const oidcMetadata = (
  redirectUris: string[] | undefined,
  postLogoutRedirectUris: string[] | undefined,
  current?: OidcClientMetadata
): OidcClientMetadata | undefined => {
  if (!redirectUris && !postLogoutRedirectUris) {
    return undefined;
  }

  return {
    redirectUris: redirectUris ?? current?.redirectUris ?? [],
    postLogoutRedirectUris: postLogoutRedirectUris ?? current?.postLogoutRedirectUris ?? [],
  };
};

const secretToMarkdown = (secret: ApplicationSecret): string =>
  [
    `### \`${secret.name}\``,
    `- Expires at: ${secret.expiresAt ? new Date(secret.expiresAt).toISOString() : 'never'}`,
    ...(secret.value ? [`- Value: \`${secret.value}\``] : []),
  ].join('\n');

const secretsToMarkdown = (secrets: ApplicationSecret[]): string =>
  secrets.length === 0
    ? '_No client secrets on this application._'
    : secrets.map((secret) => secretToMarkdown(secret)).join('\n\n');

const applicationsToMarkdown = (applications: Application[]): string =>
  applications.length === 0
    ? '_No applications in this tenant._'
    : applications.map((application) => applicationToMarkdown(application)).join('\n\n');

/**
 * Register the per-tenant application tools.
 *
 * Every tool targets a specific tenant, addressed by its own endpoint and Management API resource
 * indicator. This is what makes an end-to-end migration scriptable: create the tenant, then create
 * its applications without touching the console.
 */
export const registerApplicationTools = (server: McpServer, client: LogtoClient): void => {
  server.registerTool(
    'logto_list_applications',
    {
      title: 'List applications in a tenant',
      description: 'List every application (client) registered in a tenant.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, response_format }) => {
      try {
        const applications = await client.requestForTenant<Application[]>(
          tenant_id,
          'api/applications'
        );

        return ok(render(applications, response_format, applicationsToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_get_application',
    {
      title: 'Get an application',
      description: 'Get a single application by ID, including its type and description.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        application_id: applicationIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, application_id, response_format }) => {
      try {
        const application = await client.requestForTenant<Application>(
          tenant_id,
          `api/applications/${application_id}`
        );

        return ok(render(application, response_format, applicationToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_create_application',
    {
      title: 'Create an application',
      description:
        'Create an application inside a tenant. Set redirect_uris for SPA, Native, and Traditional apps in the same call. Creating it does NOT return a client secret: for server-side types ("Traditional", "MachineToMachine", "Protected") create one afterwards with logto_create_application_secret.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        name: z.string().min(1).max(256).describe('Display name for the application.'),
        type: applicationTypeSchema,
        description: z.string().max(256).optional().describe('Optional description.'),
        redirect_uris: uriListSchema.optional(),
        post_logout_redirect_uris: uriListSchema.optional(),
        cors_allowed_origins: uriListSchema
          .optional()
          .describe('Browser origins allowed to call this app. Usually the site origin, without a path.'),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({
      tenant_id,
      name,
      type,
      description,
      redirect_uris,
      post_logout_redirect_uris,
      cors_allowed_origins,
      response_format,
    }) => {
      try {
        const application = await client.requestForTenant<Application>(
          tenant_id,
          'api/applications',
          {
            method: 'POST',
            body: omitUndefined({
              name,
              type,
              description,
              oidcClientMetadata: oidcMetadata(redirect_uris, post_logout_redirect_uris),
              customClientMetadata: cors_allowed_origins
                ? { corsAllowedOrigins: cors_allowed_origins }
                : undefined,
            }),
          }
        );

        return ok(render(application, response_format, applicationToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_update_application',
    {
      title: 'Update an application',
      description:
        'Update an application name, description, redirect URIs, post-logout URIs, or CORS origins. URI lists replace the previous list. Other OIDC fields are kept.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        application_id: applicationIdSchema,
        name: z.string().min(1).max(256).optional().describe('New display name.'),
        description: z.string().max(256).nullable().optional().describe('New description.'),
        redirect_uris: uriListSchema.optional(),
        post_logout_redirect_uris: uriListSchema.optional(),
        cors_allowed_origins: uriListSchema.optional(),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({
      tenant_id,
      application_id,
      name,
      description,
      redirect_uris,
      post_logout_redirect_uris,
      cors_allowed_origins,
      response_format,
    }) => {
      try {
        const current = await client.requestForTenant<Application>(
          tenant_id,
          `api/applications/${application_id}`
        );
        const application = await client.requestForTenant<Application>(
          tenant_id,
          `api/applications/${application_id}`,
          {
            method: 'PATCH',
            body: omitUndefined({
              name,
              description,
              oidcClientMetadata: oidcMetadata(
                redirect_uris,
                post_logout_redirect_uris,
                current.oidcClientMetadata
              ),
              customClientMetadata: cors_allowed_origins
                ? {
                    ...current.customClientMetadata,
                    corsAllowedOrigins: cors_allowed_origins,
                  }
                : undefined,
            }),
          }
        );

        return ok(render(application, response_format, applicationToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_delete_application',
    {
      title: 'Delete an application',
      description:
        'Permanently delete an application from a tenant. This cannot be undone, and clients using its ID will stop authenticating.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        application_id: applicationIdSchema,
        confirm: z.literal(true).describe('Must be true. A safety guard against accidental deletion.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ tenant_id, application_id }) => {
      try {
        await client.requestForTenant(tenant_id, `api/applications/${application_id}`, {
          method: 'DELETE',
        });

        return ok(`Deleted application \`${application_id}\` from tenant \`${tenant_id}\`.`);
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_list_application_secrets',
    {
      title: 'List the client secrets of an application',
      description: 'List every client secret configured on an application.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        application_id: applicationIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, application_id, response_format }) => {
      try {
        const secrets = await client.requestForTenant<ApplicationSecret[]>(
          tenant_id,
          `api/applications/${application_id}/secrets`
        );

        return ok(render(secrets, response_format, secretsToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_create_application_secret',
    {
      title: 'Create a client secret for an application',
      description:
        'Create a named client secret for an application. The value is returned ONLY in this response, so store it immediately. To rotate, create a new secret and then delete the old one.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        application_id: applicationIdSchema,
        name: z.string().min(1).max(128).describe('Label for the secret, for example "Default".'),
        expires_at: z
          .number()
          .int()
          .optional()
          .describe('Optional expiry as a Unix epoch in milliseconds. Omit for a non-expiring secret.'),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ tenant_id, application_id, name, expires_at, response_format }) => {
      try {
        const secret = await client.requestForTenant<ApplicationSecret>(
          tenant_id,
          `api/applications/${application_id}/secrets`,
          { method: 'POST', body: { name, expiresAt: expires_at } }
        );

        return ok(render(secret, response_format, secretToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_delete_application_secret',
    {
      title: 'Delete a client secret from an application',
      description: 'Delete a client secret by name. Clients using that secret stop authenticating.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        application_id: applicationIdSchema,
        name: z.string().min(1).describe('Name of the secret to delete.'),
        confirm: z.literal(true).describe('Must be true. A safety guard against accidental deletion.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ tenant_id, application_id, name }) => {
      try {
        await client.requestForTenant(
          tenant_id,
          `api/applications/${application_id}/secrets/${encodeURIComponent(name)}`,
          { method: 'DELETE' }
        );

        return ok(`Deleted secret \`${name}\` from application \`${application_id}\`.`);
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );
};
