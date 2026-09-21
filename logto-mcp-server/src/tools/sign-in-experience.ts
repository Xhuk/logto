import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { render } from '../format.js';
import type { LogtoClient } from '../logto-client.js';

import { fail, ok, omitUndefined, responseFormatSchema, tenantIdSchema } from './shared.js';

type Branding = {
  logoUrl?: string;
  darkLogoUrl?: string;
  favicon?: string;
  darkFavicon?: string;
};

type SignInExperience = {
  color?: { primaryColor?: string; darkPrimaryColor?: string; isDarkModeEnabled?: boolean };
  branding?: Branding;
  signIn?: { methods?: Array<{ identifier?: string; password?: boolean; verificationCode?: boolean }> };
  signUp?: { identifiers?: string[]; password?: boolean; verify?: boolean };
  socialSignInConnectorTargets?: string[];
};

const brandingSchema = z
  .object({
    logoUrl: z.string().url().optional(),
    darkLogoUrl: z.string().url().optional(),
    favicon: z.string().url().optional(),
    darkFavicon: z.string().url().optional(),
  })
  .describe('Logo and favicon URLs shown on the sign-in page.');

const colorSchema = z
  .object({
    primaryColor: z.string().optional().describe('Hex color, for example #191c1d.'),
    darkPrimaryColor: z.string().optional(),
    isDarkModeEnabled: z.boolean().optional(),
  })
  .describe('Primary colors for the sign-in page.');

const signInExperienceToMarkdown = (experience: SignInExperience): string => {
  const methods = experience.signIn?.methods?.map((method) => method.identifier).filter(Boolean) ?? [];

  return [
    '### Sign-in experience',
    `- Color: ${experience.color?.primaryColor ?? '—'}`,
    `- Logo: ${experience.branding?.logoUrl ?? '—'}`,
    `- Dark logo: ${experience.branding?.darkLogoUrl ?? '—'}`,
    `- Favicon: ${experience.branding?.favicon ?? '—'}`,
    `- Sign-in identifiers: ${methods.length > 0 ? methods.join(', ') : '—'}`,
    `- Sign-up identifiers: ${experience.signUp?.identifiers?.join(', ') ?? '—'}`,
    `- Social targets: ${experience.socialSignInConnectorTargets?.join(', ') ?? '—'}`,
  ].join('\n');
};

/**
 * Register sign-in experience and branding tools. Both live on GET/PATCH /api/sign-in-exp.
 * The Experience SPA reads this config. The Admin Console branding page shows the same fields.
 */
export const registerSignInExperienceTools = (server: McpServer, client: LogtoClient): void => {
  server.registerTool(
    'logto_get_sign_in_experience',
    {
      title: 'Get sign-in experience and branding',
      description:
        'Get the tenant sign-in experience, including branding logos and colors. Use json when you need the full object before a patch.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tenant_id, response_format }) => {
      try {
        const experience = await client.requestForTenant<SignInExperience>(tenant_id, 'api/sign-in-exp');

        return ok(render(experience, response_format, signInExperienceToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );

  server.registerTool(
    'logto_update_sign_in_experience',
    {
      title: 'Update sign-in experience and branding',
      description:
        'Patch the sign-in experience. Send only the fields that should change. Branding logo URLs must be absolute. Nested objects replace the previous object for that field, so read the current settings first. A person can confirm the result on the sign-in page and in the Admin Console.',
      inputSchema: z.object({
        tenant_id: tenantIdSchema,
        branding: brandingSchema.optional(),
        color: colorSchema.optional(),
        sign_in: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Sign-in methods object. Read the current value before replacing it.'),
        sign_up: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Sign-up settings object. Read the current value before replacing it.'),
        social_sign_in_connector_targets: z
          .array(z.string().min(1))
          .optional()
          .describe('Connector targets shown as social buttons, for example google.'),
        response_format: responseFormatSchema,
      }),
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({
      tenant_id,
      branding,
      color,
      sign_in,
      sign_up,
      social_sign_in_connector_targets,
      response_format,
    }) => {
      try {
        const experience = await client.requestForTenant<SignInExperience>(tenant_id, 'api/sign-in-exp', {
          method: 'PATCH',
          body: omitUndefined({
            branding,
            color,
            signIn: sign_in,
            signUp: sign_up,
            socialSignInConnectorTargets: social_sign_in_connector_targets,
          }),
        });

        return ok(render(experience, response_format, signInExperienceToMarkdown));
      } catch (error) {
        return fail(error, tenant_id);
      }
    }
  );
};
