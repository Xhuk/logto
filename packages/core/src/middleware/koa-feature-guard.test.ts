import { TenantFeature } from '@logto/schemas';

import RequestError from '#src/errors/RequestError/index.js';
import { createContextWithRouteParameters } from '#src/utils/test-utils.js';

import koaFeatureGuard from './koa-feature-guard.js';

const { jest } = import.meta;

describe('koaFeatureGuard middleware', () => {
  const ctx = createContextWithRouteParameters();
  const next = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should allow the request when the feature is enabled', async () => {
    await expect(
      koaFeatureGuard({ [TenantFeature.Organizations]: true }, TenantFeature.Organizations)(
        ctx,
        next
      )
    ).resolves.toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should allow the request when the feature is not explicitly disabled', async () => {
    await expect(
      koaFeatureGuard({}, TenantFeature.Organizations)(ctx, next)
    ).resolves.toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should reject the request when the feature is disabled', async () => {
    await expect(
      koaFeatureGuard({ [TenantFeature.Organizations]: false }, TenantFeature.Organizations)(
        ctx,
        next
      )
    ).rejects.toMatchError(new RequestError({ code: 'auth.forbidden', status: 403 }));
    expect(next).not.toHaveBeenCalled();
  });
});
