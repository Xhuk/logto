import { createServer } from 'node:http';

import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  oauthMetadataResponse,
  requireBearerAuth,
} from '@modelcontextprotocol/server';
import { isMcpAuthInfo, MCPAuth } from 'mcp-auth';

import { accessContext } from './access.js';
import type { HttpModeConfig, LogtoMcpConfig } from './config.js';
import { createLogtoMcpServer } from './create-mcp-server.js';
import type { LogtoClient } from './logto-client.js';
import { incomingMessageToRequest, sendNodeResponse, withCors } from './node-http.js';

const corsPreflight = (): Response =>
  withCors(
    new Response(null, {
      status: 204,
      headers: { 'Access-Control-Max-Age': '600' },
    })
  );

/** Loopback, the public MCP hostname, and any Traefik/Tailscale aliases. */
export const allowedHttpHostnames = (
  publicUrl: URL,
  extraHostnames: readonly string[] = []
): string[] => {
  const names = new Set(localhostAllowedHostnames());

  if (publicUrl.hostname) {
    names.add(publicUrl.hostname);
  }

  for (const hostname of extraHostnames) {
    const trimmed = hostname.trim().toLowerCase();

    if (trimmed) {
      names.add(trimmed);
    }
  }

  return [...names];
};

const isMcpPath = (pathname: string, publicUrl: URL): boolean => {
  const expected = publicUrl.pathname.replace(/\/$/, '') || '/mcp';

  return pathname === expected || pathname === `${expected}/`;
};

/**
 * RFC 9728 Protected Resource Metadata for this MCP URL. Built locally so a
 * public `/mcp` host does not have to reach the Tailscale admin issuer first.
 */
export const protectedResourceMetadataResponse = (
  request: Request,
  http: HttpModeConfig,
  mcpAuth: Pick<MCPAuth, 'resourceMetadataUrl'>
): Response | undefined => {
  const requestPath = new URL(request.url).pathname.replace(/\/$/, '') || '/';
  const expected = new URL(mcpAuth.resourceMetadataUrl).pathname.replace(/\/$/, '') || '/';

  if (requestPath !== expected && requestPath !== '/.well-known/oauth-protected-resource') {
    return;
  }

  return new Response(
    JSON.stringify({
      resource: http.oauthResource,
      authorization_servers: [http.issuer],
      scopes_supported: [...http.oauthScopes],
      resource_name: 'Katra staff MCP',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    }
  );
};

/**
 * Serve Streamable HTTP MCP plus RFC 9728 metadata so Cursor can run its OAuth card.
 *
 * The Cursor login is the authority. A control-plane admin sees every tenant. A user who
 * exists as admin of one tenant sees only that tenant. The server-side machine credential
 * still performs the Management API call after that check.
 */
export const startHttpServer = async (
  config: LogtoMcpConfig,
  client: LogtoClient
): Promise<void> => {
  const http = config.http;

  if (!http) {
    throw new Error('HTTP mode requires MCP_HTTP_PORT.');
  }

  const mcpAuth = new MCPAuth({
    protectedResourceMetadata: {
      resource: http.oauthResource,
      authorizationServer: { issuer: http.issuer, type: 'oidc' },
      scopesSupported: [...http.oauthScopes],
      resourceName: 'Katra staff MCP',
    },
  });

  const gate = requireBearerAuth(
    mcpAuth.getBearerAuthOptions({ requiredScopes: [...http.oauthScopes] })
  );

  const handler = createMcpHandler(() => createLogtoMcpServer(client, { includeWhoami: true }));

  const server = createServer((request, response) => {
    void handleHttpRequest(request, response, { config, http, mcpAuth, gate, handler });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(http.port, http.host, () => {
      resolve();
    });
  });

  console.error(
    `logto-mcp-server HTTP listening on http://${http.host}:${http.port}${http.publicUrl.pathname} ` +
      `(issuer ${http.issuer}, resource ${http.oauthResource})`
  );
};

type Gate = ReturnType<typeof requireBearerAuth>;
type Handler = ReturnType<typeof createMcpHandler>;

const handleHttpRequest = async (
  nodeRequest: Parameters<typeof incomingMessageToRequest>[0],
  nodeResponse: Parameters<typeof sendNodeResponse>[0],
  context: {
    config: LogtoMcpConfig;
    http: HttpModeConfig;
    mcpAuth: MCPAuth;
    gate: Gate;
    handler: Handler;
  }
): Promise<void> => {
  try {
    const request = await incomingMessageToRequest(nodeRequest);
    const { pathname } = new URL(request.url);

    // Always check Host: bind may be 0.0.0.0 for Traefik, and Tailscale Serve
    // forwards its own hostname while the public URL is auth.kairova.services.
    const blocked = hostHeaderValidationResponse(
      request,
      allowedHttpHostnames(context.http.publicUrl, context.http.allowedHostnames)
    );

    if (blocked) {
      await sendNodeResponse(nodeResponse, withCors(blocked));
      return;
    }

    if (request.method === 'OPTIONS') {
      await sendNodeResponse(nodeResponse, corsPreflight());
      return;
    }

    if (pathname.startsWith('/.well-known/')) {
      // Protected Resource Metadata must not depend on fetching the Tailscale
      // issuer. Cursor follows authorization_servers to that host for AS metadata.
      const prm = protectedResourceMetadataResponse(request, context.http, context.mcpAuth);

      if (prm) {
        await sendNodeResponse(nodeResponse, withCors(prm));
        return;
      }

      try {
        const metadata = oauthMetadataResponse(
          request,
          await context.mcpAuth.getAuthMetadataOptions()
        );

        if (metadata) {
          await sendNodeResponse(nodeResponse, withCors(metadata));
          return;
        }
      } catch (error: unknown) {
        console.error('OAuth authorization-server metadata failed', error);
        await sendNodeResponse(
          nodeResponse,
          withCors(new Response('Authorization server metadata unavailable', { status: 502 }))
        );
        return;
      }
    }

    if (!isMcpPath(pathname, context.http.publicUrl)) {
      await sendNodeResponse(nodeResponse, withCors(new Response('Not found', { status: 404 })));
      return;
    }

    const auth = await context.gate(request);

    if (auth instanceof Response) {
      await sendNodeResponse(nodeResponse, withCors(auth));
      return;
    }

    if (
      context.config.allowedSubjects.length > 0 &&
      (!isMcpAuthInfo(auth) || !context.config.allowedSubjects.includes(auth.subject))
    ) {
      await sendNodeResponse(
        nodeResponse,
        withCors(new Response('Staff subject is not allowlisted.', { status: 403 }))
      );
      return;
    }

    const subject = isMcpAuthInfo(auth) ? auth.subject : undefined;
    const fetchHandler = () => context.handler.fetch(request, { authInfo: auth });
    const mcpResponse = subject
      ? await accessContext.run({ subject }, fetchHandler)
      : await fetchHandler();
    await sendNodeResponse(nodeResponse, withCors(mcpResponse));
  } catch (error: unknown) {
    console.error(error);
    await sendNodeResponse(
      nodeResponse,
      withCors(new Response('Internal server error', { status: 500 }))
    );
  }
};
