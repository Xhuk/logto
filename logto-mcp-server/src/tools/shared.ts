import * as z from 'zod/v4';

export const responseFormatSchema = z
  .enum(['json', 'markdown'])
  .default('markdown')
  .describe('Output format. Use "json" for programmatic processing, "markdown" for readability.');

export const tenantIdSchema = z
  .string()
  .min(1)
  .describe('The tenant (project) ID. The Admin Console for that tenant stays available for a person to verify the change.');

export const pageSchema = z
  .number()
  .int()
  .min(1)
  .default(1)
  .describe('Page number, starting at 1.');

export const pageSizeSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20)
  .describe('Page size. Maximum 100.');

const text = (value: string) => ({ type: 'text' as const, text: value });

export const ok = (value: string) => ({ content: [text(value)] });

export const fail = (error: unknown, tenantId?: string) => ({
  isError: true,
  content: [
    text(
      `Error: ${error instanceof Error ? error.message : String(error)}. ` +
        (tenantId
          ? `Verify the tenant ID ("${tenantId}") and that the machine-to-machine app is granted the Management API scope on that tenant. The Admin Console can be used to check the current state.`
          : 'Verify the machine-to-machine app scope. The Admin Console can be used to check the current state.')
    ),
  ],
});

export const confirmSchema = z
  .literal(true)
  .describe('Must be true. A safety guard against accidental deletion.');

/** Build a path with only the query entries that were provided. */
export const withQuery = (
  path: string,
  query: Record<string, string | number | boolean | undefined>
): string => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  const serialized = params.toString();

  return serialized ? `${path}?${serialized}` : path;
};

/** Drop keys the caller left unset so a PATCH does not send nulls by accident. */
export const omitUndefined = <Value extends Record<string, unknown>>(value: Value): Partial<Value> =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<Value>;

const hiddenUserKeys = new Set(['password', 'passwordEncrypted', 'passwordEncryptionMethod']);

/** Remove password material before a user record is shown to the agent. */
export const publicUser = (user: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(user).filter(([key]) => !hiddenUserKeys.has(key)));

/** List connector config keys without their values. Config often holds SMTP or OAuth secrets. */
export const configKeyList = (config: unknown): string => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return '_none_';
  }

  const keys = Object.keys(config);

  return keys.length === 0 ? '_none_' : keys.map((key) => `\`${key}\``).join(', ');
};
