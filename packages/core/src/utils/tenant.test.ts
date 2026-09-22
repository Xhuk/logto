import { adminTenantId, defaultTenantId } from '@logto/schemas';
import { GlobalValues, TtlCache } from '@logto/shared';
import { createMockUtils } from '@logto/shared/esm';

const { jest } = import.meta;

const { mockEsmWithActual, mockEsm } = createMockUtils(jest);

await mockEsmWithActual('#src/env-set/index.js', () => ({
  EnvSet: {
    get values() {
      return new GlobalValues();
    },
  },
}));

const findActiveDomain = jest.fn();
mockEsm('#src/queries/domains.js', () => ({
  createDomainsQueries: () => ({
    findActiveDomain,
  }),
}));

const mockRedisCache = new TtlCache<string, string>(60_000);
mockEsm('#src/caches/index.js', () => ({
  redisCache: mockRedisCache,
}));

const { getTenantId, clearCustomDomainCache } = await import('./tenant.js');

const getTenantIdFirstElement = async (url: URL) => {
  const [tenantId] = await getTenantId(url);
  return tenantId;
};

describe('getTenantId()', () => {
  const backupEnv = process.env;

  afterEach(() => {
    process.env = backupEnv;
    mockRedisCache.clear();
    findActiveDomain.mockReset();
  });

  it('should resolve development tenant ID when needed', async () => {
    process.env = {
      ...backupEnv,
      NODE_ENV: 'test',
      DEVELOPMENT_TENANT_ID: 'foo',
    };

    await expect(getTenantIdFirstElement(new URL('https://some.random.url'))).resolves.toBe('foo');

    process.env = {
      ...backupEnv,
      NODE_ENV: 'production',
      INTEGRATION_TEST: 'true',
      DEVELOPMENT_TENANT_ID: 'bar',
    };

    await expect(getTenantIdFirstElement(new URL('https://some.random.url'))).resolves.toBe('bar');
  });

  it('should resolve proper tenant ID for similar localhost endpoints', async () => {
    await expect(
      getTenantIdFirstElement(new URL('http://localhost:3002/some/path////'))
    ).resolves.toBe(adminTenantId);
    await expect(
      getTenantIdFirstElement(new URL('http://localhost:30021/some/path'))
    ).resolves.toBe(defaultTenantId);
    await expect(
      getTenantIdFirstElement(new URL('http://localhostt:30021/some/path'))
    ).resolves.toBe(defaultTenantId);
    await expect(getTenantIdFirstElement(new URL('https://localhost:3002'))).resolves.toBe(
      defaultTenantId
    );
  });

  it('should resolve proper tenant ID for similar domain endpoints', async () => {
    process.env = {
      ...backupEnv,
      NODE_ENV: 'production',
      ENDPOINT: 'https://foo.*.logto.mock/app',
    };

    await expect(
      getTenantIdFirstElement(new URL('https://foo.foo.logto.mock/app///asdasd'))
    ).resolves.toBe('foo');
    await expect(getTenantIdFirstElement(new URL('https://foo.*.logto.mock/app'))).resolves.toBe(
      undefined
    );
    await expect(
      getTenantIdFirstElement(new URL('https://foo.foo.logto.mockk/app///asdasd'))
    ).resolves.toBe(undefined);
    await expect(getTenantIdFirstElement(new URL('https://foo.foo.logto.mock/appp'))).resolves.toBe(
      undefined
    );
    await expect(
      getTenantIdFirstElement(new URL('https://foo.foo.logto.mock:1/app/'))
    ).resolves.toBe(undefined);
    await expect(getTenantIdFirstElement(new URL('http://foo.foo.logto.mock/app'))).resolves.toBe(
      undefined
    );
    await expect(
      getTenantIdFirstElement(new URL('https://user.foo.bar.logto.mock/app'))
    ).resolves.toBe(undefined);
    await expect(
      getTenantIdFirstElement(new URL('https://foo.bar.bar.logto.mock/app'))
    ).resolves.toBe(undefined);
  });

  it('should resolve proper tenant ID if admin localhost is disabled', async () => {
    process.env = {
      ...backupEnv,
      NODE_ENV: 'production',
      PORT: '5000',
      ENDPOINT: 'https://user.*.logto.mock/app',
      ADMIN_ENDPOINT: 'https://admin.logto.mock/app',
      ADMIN_DISABLE_LOCALHOST: '1',
    };

    await expect(
      getTenantIdFirstElement(new URL('http://localhost:5000/app///asdasd'))
    ).resolves.toBe(undefined);
    await expect(
      getTenantIdFirstElement(new URL('http://localhost:3002/app///asdasd'))
    ).resolves.toBe(undefined);
    await expect(getTenantIdFirstElement(new URL('https://user.foo.logto.mock/app'))).resolves.toBe(
      'foo'
    );
    await expect(
      getTenantIdFirstElement(new URL('https://user.admin.logto.mock/app//'))
    ).resolves.toBe(undefined); // Admin endpoint is explicitly set
    await expect(getTenantIdFirstElement(new URL('https://admin.logto.mock/app'))).resolves.toBe(
      adminTenantId
    );

    process.env = {
      ...backupEnv,
      NODE_ENV: 'production',
      PORT: '5000',
      ENDPOINT: 'https://user.*.logto.mock/app',
      ADMIN_DISABLE_LOCALHOST: '1',
    };
    await expect(
      getTenantIdFirstElement(new URL('https://user.admin.logto.mock/app//'))
    ).resolves.toBe('admin');
  });

  it('should resolve proper tenant ID for path-based multi-tenancy', async () => {
    process.env = {
      ...backupEnv,
      NODE_ENV: 'production',
      PORT: '5000',
      ENDPOINT: 'https://user.logto.mock/app',
      PATH_BASED_MULTI_TENANCY: '1',
    };

    await expect(
      getTenantIdFirstElement(new URL('http://localhost:5000/app///asdasd'))
    ).resolves.toBe('app');
    await expect(
      getTenantIdFirstElement(new URL('http://localhost:3002///bar///asdasd'))
    ).resolves.toBe(adminTenantId);
    await expect(getTenantIdFirstElement(new URL('https://user.foo.logto.mock/app'))).resolves.toBe(
      undefined
    );
    await expect(
      getTenantIdFirstElement(new URL('https://user.admin.logto.mock/app//'))
    ).resolves.toBe(undefined);
    await expect(getTenantIdFirstElement(new URL('https://user.logto.mock/app'))).resolves.toBe(
      undefined
    );
    await expect(
      getTenantIdFirstElement(new URL('https://user.logto.mock/app/katra'))
    ).resolves.toBe(adminTenantId);
    await expect(
      getTenantIdFirstElement(new URL('https://user.logto.mock/app/admin'))
    ).resolves.toBe(undefined);
  });

  it('should resolve proper custom domain', async () => {
    process.env = {
      ...backupEnv,
      ENDPOINT: 'https://foo.*.logto.mock/app',
      NODE_ENV: 'production',
    };
    findActiveDomain.mockResolvedValueOnce({ domain: 'logto.mock.com', tenantId: 'mock' });
    await expect(getTenantIdFirstElement(new URL('https://logto.mock.com'))).resolves.toBe('mock');
  });

  it('should discard a stale write-back when the domain cache is invalidated mid-lookup', async () => {
    process.env = {
      ...backupEnv,
      ENDPOINT: 'https://foo.*.logto.mock/app',
      NODE_ENV: 'production',
    };
    findActiveDomain
      .mockImplementationOnce(async () => {
        /**
         * The domain mutation lands while this lookup's database read is in flight, i.e. the
         * mapping returned below reflects pre-mutation state.
         */
        await clearCustomDomainCache('logto.mock.com');
        return { domain: 'logto.mock.com', tenantId: 'stale' };
      })
      .mockResolvedValueOnce({ domain: 'logto.mock.com', tenantId: 'fresh' });

    /** The in-flight lookup still resolves, but its result must not persist in the cache. */
    await expect(getTenantIdFirstElement(new URL('https://logto.mock.com'))).resolves.toBe('stale');
    await expect(getTenantIdFirstElement(new URL('https://logto.mock.com'))).resolves.toBe('fresh');

    /**
     * Served from the cache: both queued database results are already consumed, so a cache
     * miss here would resolve to `undefined`.
     */
    await expect(getTenantIdFirstElement(new URL('https://logto.mock.com'))).resolves.toBe('fresh');
  });

  it('resolves a product host only at /auth when path-based multi-tenancy is on', async () => {
    process.env = {
      ...backupEnv,
      NODE_ENV: 'production',
      ENDPOINT: 'https://user.logto.mock/app',
      PATH_BASED_MULTI_TENANCY: '1',
    };
    findActiveDomain.mockImplementation(async (domain: string) => {
      if (domain === 'lotly.lat') {
        return { domain, tenantId: '3ni0yi' };
      }

      if (domain === 'propflow.kairova.services') {
        return { domain, tenantId: 'g6qx2x' };
      }

      return null;
    });

    const resolve = async (href: string) => getTenantId(new URL(href));

    await expect(resolve('https://lotly.lat/auth')).resolves.toEqual(['3ni0yi', true]);
    await expect(resolve('https://lotly.lat/auth/')).resolves.toEqual(['3ni0yi', true]);
    await expect(resolve('https://lotly.lat/auth/oidc/auth')).resolves.toEqual(['3ni0yi', true]);
    await expect(
      resolve('https://lotly.lat/auth/oidc/.well-known/openid-configuration?login_hint=xhuk')
    ).resolves.toEqual(['3ni0yi', true]);
    await expect(resolve('https://Lotly.LAT/auth/oidc/token')).resolves.toEqual(['3ni0yi', true]);
    await expect(resolve('https://lotly.lat:443/auth')).resolves.toEqual(['3ni0yi', true]);
    await expect(resolve('https://lotly.lat./auth')).resolves.toEqual(['3ni0yi', true]);
    await expect(resolve('https://propflow.kairova.services/auth/oidc/token')).resolves.toEqual([
      'g6qx2x',
      true,
    ]);
    await expect(resolve('https://www.lotly.lat/auth')).resolves.toEqual([undefined, false]);
    await expect(resolve('https://vetgroom.com.mx/auth')).resolves.toEqual([undefined, false]);

    expect(findActiveDomain).toHaveBeenCalledWith('lotly.lat');
    expect(findActiveDomain).toHaveBeenCalledWith('propflow.kairova.services');
    expect(findActiveDomain).toHaveBeenCalledWith('www.lotly.lat');
    expect(findActiveDomain).toHaveBeenCalledWith('vetgroom.com.mx');
  });

  it('does not query domains for paths, schemes, or ports that are not product auth', async () => {
    process.env = {
      ...backupEnv,
      NODE_ENV: 'production',
      ENDPOINT: 'https://user.logto.mock/app',
      PATH_BASED_MULTI_TENANCY: '1',
    };

    const resolve = async (href: string) => getTenantId(new URL(href));

    await expect(resolve('https://lotly.lat/')).resolves.toEqual([undefined, false]);
    await expect(resolve('https://lotly.lat/3ni0yi/oidc/auth')).resolves.toEqual([
      undefined,
      false,
    ]);
    await expect(resolve('https://lotly.lat/authentication')).resolves.toEqual([undefined, false]);
    await expect(resolve('https://lotly.lat/auth2')).resolves.toEqual([undefined, false]);
    await expect(resolve('https://lotly.lat/Auth')).resolves.toEqual([undefined, false]);
    await expect(resolve('https://lotly.lat/auth%2Foidc')).resolves.toEqual([undefined, false]);
    await expect(resolve('https://lotly.lat/auth/../3ni0yi')).resolves.toEqual([undefined, false]);
    await expect(resolve('http://lotly.lat/auth')).resolves.toEqual([undefined, false]);
    await expect(resolve('https://lotly.lat:8443/auth')).resolves.toEqual([undefined, false]);
    expect(findActiveDomain).not.toHaveBeenCalled();
  });

  it('keeps path-based ids on the configured staff host', async () => {
    process.env = {
      ...backupEnv,
      NODE_ENV: 'production',
      ENDPOINT: 'https://user.logto.mock/app',
      ADMIN_ENDPOINT: 'https://admin.logto.mock/console',
      PATH_BASED_MULTI_TENANCY: '1',
    };
    findActiveDomain.mockResolvedValue({ domain: 'user.logto.mock', tenantId: 'should-not-win' });

    const resolve = async (href: string) => getTenantId(new URL(href));

    await expect(resolve('https://user.logto.mock/app/katra')).resolves.toEqual([
      adminTenantId,
      false,
    ]);
    await expect(resolve('https://user.logto.mock/app/3ni0yi/oidc/auth')).resolves.toEqual([
      '3ni0yi',
      false,
    ]);
    await expect(resolve('https://user.logto.mock/app/auth')).resolves.toEqual(['auth', false]);
    await expect(resolve('https://user.logto.mock/auth')).resolves.toEqual([undefined, false]);
    await expect(resolve('https://admin.logto.mock/console/auth')).resolves.toEqual([
      adminTenantId,
      false,
    ]);
    expect(findActiveDomain).not.toHaveBeenCalled();
  });

  it('lets the development tenant swallow product hosts outside production', async () => {
    process.env = {
      ...backupEnv,
      NODE_ENV: 'test',
      DEVELOPMENT_TENANT_ID: 'dev-tenant',
      PATH_BASED_MULTI_TENANCY: '1',
    };
    findActiveDomain.mockResolvedValue({ domain: 'lotly.lat', tenantId: '3ni0yi' });

    await expect(getTenantId(new URL('https://lotly.lat/auth'))).resolves.toEqual([
      'dev-tenant',
      false,
    ]);
    expect(findActiveDomain).not.toHaveBeenCalled();
  });
});
