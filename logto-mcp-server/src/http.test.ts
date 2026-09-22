import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { allowedHttpHostnames, protectedResourceMetadataResponse } from './http.js';

describe('allowedHttpHostnames', () => {
  it('keeps loopback and adds the public hostname', () => {
    const names = allowedHttpHostnames(new URL('https://auth.kairova.services/mcp'));

    assert.ok(names.includes('127.0.0.1'));
    assert.ok(names.includes('localhost'));
    assert.ok(names.includes('auth.kairova.services'));
  });

  it('adds Tailscale aliases from the allowlist', () => {
    const names = allowedHttpHostnames(new URL('https://auth.kairova.services/mcp'), [
      'katra-imperial.tailfadff7.ts.net',
    ]);

    assert.ok(names.includes('auth.kairova.services'));
    assert.ok(names.includes('katra-imperial.tailfadff7.ts.net'));
  });
});

describe('protectedResourceMetadataResponse', () => {
  const http = {
    host: '0.0.0.0',
    port: 3301,
    publicUrl: new URL('https://auth.kairova.services/mcp'),
    oauthResource: 'https://auth.kairova.services/mcp',
    oauthScopes: ['mcp:all'] as const,
    issuer: 'https://katra-imperial.tailfadff7.ts.net:8443/oidc',
    allowedHostnames: [] as const,
  };
  const mcpAuth = {
    resourceMetadataUrl: 'https://auth.kairova.services/.well-known/oauth-protected-resource/mcp',
  };

  it('serves the RFC 9728 document for the resource path', async () => {
    const response = protectedResourceMetadataResponse(
      new Request('https://auth.kairova.services/.well-known/oauth-protected-resource/mcp'),
      http,
      mcpAuth
    );

    assert.ok(response);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      resource: string;
      authorization_servers: string[];
      scopes_supported: string[];
    };
    assert.equal(body.resource, 'https://auth.kairova.services/mcp');
    assert.deepEqual(body.authorization_servers, [
      'https://katra-imperial.tailfadff7.ts.net:8443/oidc',
    ]);
    assert.deepEqual(body.scopes_supported, ['mcp:all']);
  });

  it('ignores unrelated well-known paths', () => {
    assert.equal(
      protectedResourceMetadataResponse(
        new Request('https://auth.kairova.services/.well-known/openid-configuration'),
        http,
        mcpAuth
      ),
      undefined
    );
  });
});
