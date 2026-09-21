import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig, resolveTenantEndpoint } from './config.js';

const m2m = {
  LOGTO_ENDPOINT: 'https://auth.example.com',
  LOGTO_MCP_CLIENT_ID: 'm2m-id',
  LOGTO_MCP_CLIENT_SECRET: 'm2m-secret',
};

describe('loadConfig', () => {
  it('defaults to stdio (no HTTP) and the OSS Management API indicator', () => {
    const config = loadConfig(m2m);

    assert.equal(config.http, undefined);
    assert.equal(config.resource, 'https://default.logto.app/api');
    assert.equal(config.clientId, 'm2m-id');
  });

  it('accepts LOGTO_APP_ID aliases used by the fleet mcp.json', () => {
    const config = loadConfig({
      LOGTO_ENDPOINT: 'https://auth.kairova.services',
      LOGTO_APP_ID: 'fleet-id',
      LOGTO_APP_SECRET: 'fleet-secret',
      LOGTO_API_INDICATOR: 'https://default.logto.app/api',
    });

    assert.equal(config.clientId, 'fleet-id');
    assert.equal(config.resource, 'https://default.logto.app/api');
  });

  it('enables HTTP mode from MCP_HTTP_PORT and derives the OAuth resource', () => {
    const config = loadConfig({
      ...m2m,
      MCP_HTTP_PORT: '3301',
    });

    assert.ok(config.http);
    assert.equal(config.http.port, 3301);
    assert.equal(config.http.host, '127.0.0.1');
    assert.equal(config.http.publicUrl.href, 'http://127.0.0.1:3301/mcp');
    assert.equal(config.http.oauthResource, 'http://127.0.0.1:3301/mcp');
    assert.equal(config.http.issuer, 'https://auth.example.com/oidc');
    assert.deepEqual(config.http.oauthScopes, ['mcp:all']);
  });

  it('strips a trailing slash so the resource matches Cursor mcp.json', () => {
    const config = loadConfig({
      ...m2m,
      MCP_HTTP_PORT: '3301',
      MCP_OAUTH_RESOURCE: 'http://127.0.0.1:3301/mcp/',
    });

    assert.equal(config.http?.oauthResource, 'http://127.0.0.1:3301/mcp');
  });

  it('resolves a custom-domain tenant endpoint override', () => {
    const config = loadConfig({
      ...m2m,
      LOGTO_TENANT_ENDPOINT_TEMPLATE: 'https://{tenantId}.example.com',
      LOGTO_TENANT_ENDPOINTS: 'abc=https://auth.lotly.lat',
    });

    assert.equal(resolveTenantEndpoint(config, 'abc').href, 'https://auth.lotly.lat/');
    assert.equal(resolveTenantEndpoint(config, 'other').href, 'https://other.example.com/');
  });

  it('rejects a missing M2M secret', () => {
    assert.throws(
      () => loadConfig({ LOGTO_ENDPOINT: 'https://auth.example.com' }),
      /machine-to-machine credentials/
    );
  });
});
