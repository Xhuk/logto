import { isTenantFeatureEnabled, type TenantFeature, type TenantFeatures } from '@logto/schemas';
import type { Middleware } from 'koa';
import { type IRouterParamContext } from 'koa-router';

import RequestError from '#src/errors/RequestError/index.js';

/**
 * Guard a route behind a per-tenant feature flag. When the flag is disabled for the current
 * tenant, the request is rejected with a 403.
 */
export default function koaFeatureGuard<StateT, ContextT extends IRouterParamContext, BodyT>(
  features: TenantFeatures,
  feature: TenantFeature
): Middleware<StateT, ContextT, BodyT> {
  return async (ctx, next) => {
    if (!isTenantFeatureEnabled(features, feature)) {
      throw new RequestError({ code: 'auth.forbidden', status: 403 });
    }

    return next();
  };
}
