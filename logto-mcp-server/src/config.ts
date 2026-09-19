import * as z from 'zod/v4';

/** Default Logto Management API resource indicator (used as the token audience). */
const defaultResource = 'https://admin.logto.app/api';

const environmentGuard = z.object({
  LOGTO_ENDPOINT: z.string().min(1),
  LOGTO_MCP_CLIENT_ID: z.string().min(1),
  LOGTO_MCP_CLIENT_SECRET: z.string().min(1),
  LOGTO_MCP_RESOURCE: z.string().min(1).optional(),
  LOGTO_MCP_SCOPE: z.string().min(1).optional(),
});

export type LogtoMcpConfig = {
  /** Base endpoint that serves the Management API (admin tenant in multi-tenant setups). */
  endpoint: URL;
  clientId: string;
  clientSecret: string;
  /** Management API resource indicator. */
  resource: string;
  /** Space-separated scopes to request. */
  scope: string;
};

/**
 * Read and validate configuration from the environment.
 *
 * Secrets are read from environment variables only, never from code, and validated at startup so
 * misconfiguration fails fast with actionable messages.
 */
export const loadConfig = (environment: NodeJS.ProcessEnv = process.env): LogtoMcpConfig => {
  const result = environmentGuard.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration. Required: LOGTO_ENDPOINT, LOGTO_MCP_CLIENT_ID, ` +
        `LOGTO_MCP_CLIENT_SECRET.\n${details}`
    );
  }

  const { LOGTO_ENDPOINT, LOGTO_MCP_CLIENT_ID, LOGTO_MCP_CLIENT_SECRET } = result.data;

  let endpoint: URL;
  try {
    endpoint = new URL(LOGTO_ENDPOINT);
  } catch {
    throw new Error(`LOGTO_ENDPOINT must be a valid URL, received "${LOGTO_ENDPOINT}".`);
  }

  return {
    endpoint,
    clientId: LOGTO_MCP_CLIENT_ID,
    clientSecret: LOGTO_MCP_CLIENT_SECRET,
    resource: result.data.LOGTO_MCP_RESOURCE ?? defaultResource,
    scope: result.data.LOGTO_MCP_SCOPE ?? 'all',
  };
};
