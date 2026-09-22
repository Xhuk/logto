import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LogtoApiError } from '../logto-client.js';

import { oidcIssuer, oidcTokenEndpoint, provisionMachineClient, vpsHostTokenEndpoint, type TenantApi } from './explicit-auth.js';

const base = new URL('https://katra.example/2thyo9/');

describe('token urls', () => {
  it('keeps the tenant segment', () => {
    assert.equal(vpsHostTokenEndpoint('2thyo9'), 'http://127.0.0.1:13101/2thyo9/oidc/token');
    assert.equal(oidcTokenEndpoint(base), 'https://katra.example/2thyo9/oidc/token');
    assert.equal(oidcIssuer(base), 'https://katra.example/2thyo9/oidc');
  });
});

describe('provisionMachineClient', () => {
  it('creates the app, secret, role, and returns the secret once', async () => {
    const calls: string[] = [];
    const api: TenantApi = {
      async get(path) {
        if (path.startsWith('api/applications?')) return [];
        if (path.startsWith('api/applications/') && path.endsWith('/secrets')) return [];
        if (path.startsWith('api/resources')) {
          return [
            {
              id: 'res',
              name: 'Management',
              indicator: 'https://2thyo9.logto.app/api',
              scopes: [{ id: 'scope-all', name: 'all' }],
            },
          ];
        }
        if (path.startsWith('api/roles')) return [];
        throw new Error(path);
      },
      async send(path, _method, body) {
        calls.push(path);
        if (path === 'api/applications') return { id: 'app-1', name: 'Lotly API', type: 'MachineToMachine' };
        if (path.endsWith('/secrets')) return { name: 'machine', value: 'secret-once', ...(body as object) };
        if (path === 'api/roles') return { id: 'role-1', name: 'Lotly API' };
        if (path.endsWith('/applications')) return undefined;
        throw new Error(path);
      },
    };

    const created = await provisionMachineClient(api, {
      tenantId: '2thyo9',
      name: 'Lotly API',
      secretName: 'machine',
      rotateSecret: false,
      resourceIndicator: 'https://2thyo9.logto.app/api',
      resourceName: 'Lotly API',
      scopes: ['all'],
      roleName: 'Lotly API',
      configuredBase: base,
      managementResource: true,
    });

    assert.equal(created.clientSecret, 'secret-once');
    assert.equal(created.clientId, 'app-1');
    assert.equal(created.resource, 'https://2thyo9.logto.app/api');
    assert.equal(created.scope, 'all');
    assert.equal(created.tokenEndpoints.vpsHostNamespace, 'http://127.0.0.1:13101/2thyo9/oidc/token');
    assert.deepEqual(calls, [
      'api/applications',
      'api/applications/app-1/secrets',
      'api/roles',
      'api/roles/role-1/applications',
    ]);

    const again = await provisionMachineClient(
      {
        ...api,
        async get(path) {
          if (path.startsWith('api/applications?')) {
            return [{ id: 'app-1', name: 'Lotly API', type: 'MachineToMachine' }];
          }
          if (path.endsWith('/secrets')) return [{ name: 'machine' }];
          if (path.startsWith('api/roles')) return [{ id: 'role-1', name: 'Lotly API' }];
          return api.get(path);
        },
        async send(path) {
          if (path.endsWith('/scopes')) throw new LogtoApiError(422, 'exists', 'role.scope_exists');
          if (path.endsWith('/applications')) {
            throw new LogtoApiError(422, 'exists', 'role.application_exists');
          }
          throw new Error(path);
        },
      },
      {
        tenantId: '2thyo9',
        name: 'Lotly API',
        secretName: 'machine',
        rotateSecret: false,
        resourceIndicator: 'https://2thyo9.logto.app/api',
        resourceName: 'Lotly API',
        scopes: ['all'],
        roleName: 'Lotly API',
        configuredBase: base,
        managementResource: true,
      }
    );

    assert.equal(again.clientSecret, null);
  });

  it('treats an existing role assignment as success', async () => {
    const api: TenantApi = {
      async get(path) {
        if (path.startsWith('api/applications?')) {
          return [{ id: 'app-1', name: 'Lotly API', type: 'MachineToMachine' }];
        }
        if (path.endsWith('/secrets')) return [];
        if (path.startsWith('api/resources')) {
          return [{ id: 'res', indicator: 'https://api.example', scopes: [] }];
        }
        if (path.startsWith('api/roles')) return [{ id: 'role-1', name: 'Lotly API', type: 'MachineToMachine' }];
        throw new Error(path);
      },
      async send(path) {
        if (path.endsWith('/secrets')) return { name: 'machine', value: 's' };
        if (path.endsWith('/scopes') && path.includes('/resources/')) return { id: 'scope-read', name: 'read:orders' };
        if (path.endsWith('/scopes')) throw new LogtoApiError(422, 'exists', 'role.scope_exists');
        if (path.endsWith('/applications')) throw new LogtoApiError(422, 'exists', 'role.application_exists');
        throw new Error(path);
      },
    };

    const auth = await provisionMachineClient(api, {
      tenantId: '2thyo9',
      name: 'Lotly API',
      secretName: 'machine',
      rotateSecret: false,
      resourceIndicator: 'https://api.example',
      resourceName: 'Orders',
      scopes: ['read:orders'],
      roleName: 'Lotly API',
      configuredBase: base,
      managementResource: false,
    });

    assert.equal(auth.scope, 'read:orders');
    assert.equal(auth.roleId, 'role-1');
  });
});
